import { Platform } from 'react-native'

import { createOnlinePlayers, OnlineError, type OnlinePlayersOptions, type PushModule } from '../online/onlinePlayers'
import { memoryStorage, type OnlineStorage } from '../online/storage'

// A Tastic-Server stand-in: players made, renamed, checked and deleted by key, and the push token's players
interface FakeServer {
  players: Map<string, { id: string; name: string }>
  pushTokens: { pushToken: string | null; playerTokens: string[] }[]
  reachable: boolean
  calls: { method: string; path: string; token?: string; body?: unknown; headers: Record<string, string> }[]
}

function fakeServer(): { server: FakeServer; fetch: typeof fetch } {
  const server: FakeServer = { players: new Map(), pushTokens: [], reachable: true, calls: [] }
  let next = 0
  const fetchImpl = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    if (!server.reachable) throw new TypeError('Network request failed')
    const path = url.replace('https://play.test', '')
    const token = init.headers.Authorization?.replace('Bearer ', '')
    const body = init.body ? JSON.parse(init.body) : undefined
    server.calls.push({ method: init.method, path, token, body, headers: init.headers })
    const reply = (status: number, json: unknown = {}) => ({ ok: status < 300, status, json: async () => json }) as Response
    if (init.method === 'POST' && path === '/players') {
      const id = `p${++next}`
      server.players.set(`key-${id}`, { id, name: body.name })
      return reply(201, { player: { id, name: body.name }, token: `key-${id}` })
    }
    if (path === '/push-token') {
      if (!body.playerTokens.every((t: string) => server.players.has(t))) return reply(401, { error: 'Not signed in' })
      server.pushTokens.push(body)
      return reply(204)
    }
    const player = token ? server.players.get(token) : undefined
    if (!player) return reply(401, { error: 'Not signed in' })
    if (path === '/players/me' && init.method === 'GET') return reply(200, { player })
    if (path === '/players/me' && init.method === 'PATCH') {
      player.name = body.name
      return reply(200, { player })
    }
    if (path === '/players/me' && init.method === 'DELETE') {
      server.players.delete(token as string)
      return reply(204)
    }
    return reply(200, { ok: true, as: player.id })
  }
  return { server, fetch: fetchImpl as unknown as typeof fetch }
}

const KID = { id: 'profile-kid', name: 'Kid' }
const SAM = { id: 'profile-sam', name: 'Sam' }

function setup(options: Partial<OnlinePlayersOptions> = {}, storage: OnlineStorage = memoryStorage()) {
  const { server, fetch } = fakeServer()
  const online = createOnlinePlayers({ game: 'hexfleet', serverUrl: 'https://play.test', rulesVersion: '7', storage, fetch, ...options })
  return { server, online, storage, fetch }
}

function pushes(overrides: Partial<PushModule> = {}): PushModule {
  return {
    getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[device]' })),
    ...overrides
  }
}

describe('createOnlinePlayers', () => {
  it('makes a player the first time a profile goes online, once however often it is asked at once', async () => {
    const { server, online } = setup()
    const [a, b] = await Promise.all([online.ensure(KID), online.ensure(KID)])
    expect(a).toEqual({ profileId: KID.id, id: 'p1', token: 'key-p1', name: 'Kid' })
    expect(b).toEqual(a)
    expect(server.calls.filter((c) => c.path === '/players')).toHaveLength(1)
    expect(server.calls[0].headers).toMatchObject({ 'X-Game': 'hexfleet', 'X-Rules-Version': '7' })
    expect(online.players()).toEqual([a])
    expect(online.playerOf(KID.id)).toEqual(a)
  })

  it('gives each profile a player of its own', async () => {
    const { online } = setup()
    const kid = await online.ensure(KID)
    const sam = await online.ensure(SAM)
    expect(kid.id).not.toBe(sam.id)
    expect(online.players().map((p) => p.profileId)).toEqual([KID.id, SAM.id])
  })

  it('keeps the players across launches, and checks a kept player with the server before using it', async () => {
    const storage = memoryStorage()
    const first = setup({}, storage)
    await first.online.ensure(KID)
    const again = createOnlinePlayers({ game: 'hexfleet', serverUrl: 'https://play.test', rulesVersion: '7', storage, fetch: first.fetch })
    await again.load()
    expect(again.players().map((p) => p.name)).toEqual(['Kid'])
    await again.ensure(KID)
    await again.ensure(KID)
    expect(first.server.calls.filter((c) => c.method === 'GET' && c.path === '/players/me')).toHaveLength(1)
    expect(first.server.calls.filter((c) => c.path === '/players')).toHaveLength(1)
  })

  it('keeps games apart on one device', async () => {
    const storage = memoryStorage()
    const { online, fetch } = setup({}, storage)
    await online.ensure(KID)
    const other = createOnlinePlayers({ game: 'cardtastic', serverUrl: 'https://play.test', rulesVersion: '1', storage, fetch })
    await other.load()
    expect(other.players()).toEqual([])
  })

  it('renames the player with its profile', async () => {
    const { server, online } = setup()
    await online.ensure(KID)
    const renamed = await online.ensure({ ...KID, name: 'Kiddo' })
    expect(renamed.name).toBe('Kiddo')
    expect(server.players.get('key-p1')?.name).toBe('Kiddo')
  })

  it('sends the name a game picks instead of the profile’s', async () => {
    const { server, online } = setup({ nameOf: () => 'CardTastic' })
    await online.ensure(KID)
    expect(server.players.get('key-p1')?.name).toBe('CardTastic')
  })

  it('makes a new player when the server no longer knows the kept one', async () => {
    const { server, online, storage, fetch } = setup()
    await online.ensure(KID)
    server.players.clear()
    // The next launch checks the kept player first: the check's 401 forgets it, and a new one is made
    const restarted = createOnlinePlayers({ game: 'hexfleet', serverUrl: 'https://play.test', rulesVersion: '7', storage, fetch })
    const made = await restarted.ensure(KID)
    expect(made.id).toBe('p2')
    expect(restarted.players()).toEqual([made])
  })

  it('signs calls as the profile’s player, and forgets a player whose key the server refuses', async () => {
    const { server, online } = setup()
    await online.ensure(KID)
    await expect(online.call(KID.id, 'GET', '/matches')).resolves.toEqual({ ok: true, as: 'p1' })
    expect(server.calls.at(-1)?.token).toBe('key-p1')
    server.players.clear()
    await expect(online.call(KID.id, 'GET', '/matches')).rejects.toMatchObject({ status: 401 })
    expect(online.players()).toEqual([])
    await expect(online.call(SAM.id, 'GET', '/matches')).rejects.toBeInstanceOf(OnlineError)
  })

  it('says when the server can’t be reached', async () => {
    const { server, online } = setup()
    server.reachable = false
    await expect(online.ensure(KID)).rejects.toMatchObject({ status: 0, message: "Can't reach the server" })
  })

  describe('sync', () => {
    it('renames players whose profile has a new name', async () => {
      const { server, online } = setup()
      await online.ensure(KID)
      await online.sync([{ ...KID, name: 'Kiddo' }])
      expect(server.players.get('key-p1')?.name).toBe('Kiddo')
      expect(online.playerOf(KID.id)?.name).toBe('Kiddo')
    })

    it('deletes from the server the players whose profile is gone', async () => {
      const { server, online } = setup()
      await online.ensure(KID)
      await online.ensure(SAM)
      await online.sync([SAM])
      expect(server.players.has('key-p1')).toBe(false)
      expect(online.players().map((p) => p.profileId)).toEqual([SAM.id])
    })

    it('tries a deletion the server could not take again next time, even after a relaunch', async () => {
      const { server, online, storage, fetch } = setup()
      await online.ensure(KID)
      server.reachable = false
      await online.sync([])
      expect(online.players()).toEqual([])
      expect(server.players.has('key-p1')).toBe(true)
      server.reachable = true
      const relaunched = createOnlinePlayers({ game: 'hexfleet', serverUrl: 'https://play.test', rulesVersion: '7', storage, fetch })
      await relaunched.sync([])
      expect(server.players.has('key-p1')).toBe(false)
      expect(await storage.getItem('hexfleet.online.player.profile-kid')).toBeNull()
    })
  })

  describe('pushes', () => {
    it('registers the device’s push token for every player at once', async () => {
      const notifications = pushes()
      const { server, online } = setup({ notifications })
      await online.ensure(KID)
      await online.ensure(SAM)
      await online.registerPushes(false)
      expect(server.pushTokens.at(-1)).toEqual({ pushToken: 'ExponentPushToken[device]', playerTokens: ['key-p1', 'key-p2'] })
    })

    it('asks for permission only when told to', async () => {
      const notifications = pushes({ getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })) })
      const { server, online } = setup({ notifications })
      await online.ensure(KID)
      await online.registerPushes(false)
      expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled()
      expect(server.pushTokens).toEqual([])
      await online.registerPushes(true)
      expect(notifications.requestPermissionsAsync).toHaveBeenCalled()
      expect(server.pushTokens.at(-1)?.playerTokens).toEqual(['key-p1'])
    })

    it('does nothing with no players, no module, or in a browser', async () => {
      const notifications = pushes()
      const none = setup({ notifications })
      await none.online.registerPushes(true)
      expect(notifications.getPermissionsAsync).not.toHaveBeenCalled()
      const noModule = setup()
      await noModule.online.ensure(KID)
      await noModule.online.registerPushes(true)
      expect(noModule.server.pushTokens).toEqual([])
      const web = setup({ notifications })
      ;(Platform as { OS: string }).OS = 'web'
      try {
        await web.online.ensure(KID)
        await web.online.registerPushes(true)
      } finally {
        ;(Platform as { OS: string }).OS = 'ios'
      }
      expect(web.server.pushTokens).toEqual([])
    })

    it('drops a player the server lost and registers the rest', async () => {
      const notifications = pushes()
      const { server, online } = setup({ notifications })
      await online.ensure(KID)
      await online.ensure(SAM)
      server.players.delete('key-p1')
      await online.registerPushes(false)
      expect(server.pushTokens.at(-1)?.playerTokens).toEqual(['key-p2'])
      expect(online.players().map((p) => p.profileId)).toEqual([SAM.id])
    })

    it('finds the profile a push is for', async () => {
      const { online } = setup()
      await online.ensure(KID)
      await online.ensure(SAM)
      expect(online.profileOfPush({ matchId: 'm', playerId: 'p2' })).toBe(SAM.id)
      expect(online.profileOfPush({ matchId: 'm' })).toBeNull()
      expect(online.profileOfPush(null)).toBeNull()
    })
  })

  describe('Delete Online Data', () => {
    it('deletes one profile’s player, or every player on the device', async () => {
      const { server, online } = setup()
      await online.ensure(KID)
      await online.ensure(SAM)
      await online.remove(KID.id)
      expect(server.players.has('key-p1')).toBe(false)
      expect(online.players().map((p) => p.profileId)).toEqual([SAM.id])
      await online.removeAll()
      expect(server.players.size).toBe(0)
      expect(online.players()).toEqual([])
    })

    it('keeps the player when the server can’t be reached', async () => {
      const { server, online } = setup()
      await online.ensure(KID)
      server.reachable = false
      await expect(online.removeAll()).rejects.toMatchObject({ status: 0 })
      expect(online.players()).toHaveLength(1)
    })

    it('forgets a player the server had already deleted', async () => {
      const { server, online } = setup()
      await online.ensure(KID)
      server.players.clear()
      await online.removeAll()
      expect(online.players()).toEqual([])
    })
  })

  it('tells subscribers when the players change', async () => {
    const { online } = setup()
    const listener = jest.fn()
    const unsubscribe = online.subscribe(listener)
    await online.ensure(KID)
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    listener.mockClear()
    await online.ensure(SAM)
    expect(listener).not.toHaveBeenCalled()
  })
})
