import { Platform } from 'react-native'

import { defaultStorage, type OnlineStorage, type SecureStoreModule } from './storage'

// Each profile's anonymous player on Tastic-Server, the fleet's game server (HexFleet's ONLINE.md, section 9): a profile is the person,
// offline and online, so each profile that plays online gets a player of its own, one per game. The server never gets the profile's
// id, an email or a device id: only the player's name (the one friends see), its push token if notifications are allowed, and what the
// game sends. A player is made the first time its profile goes online, renamed with it, and deleted from the server when the profile
// is deleted (in this game or, through the shared roster, a sibling one) or when the player asks (Delete Online Data). Each game keeps
// its own server calls (HexFleet's matches, CardTastic's daily runs) and signs them with `call`

export interface OnlinePlayer {
  profileId: string
  // The server's id for the player, and the key every call made as them carries
  id: string
  token: string
  // The name the server has for them (`nameOf`)
  name: string
  // The profile's own name, as the roster last handed it to `ensure` or `sync` (the server's name until either has run this launch).
  // What a game shows for the player, Delete Online Data's "Online as" included, since a game can send the server another name
  profileName: string
}

// What the players follow of a profile
export interface OnlineProfile {
  id: string
  name: string
}

// The parts of expo-notifications this uses, so the package never imports it: hand in `import * as Notifications from 'expo-notifications'`
export interface PushModule {
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean; ios?: { status: number } }>
  requestPermissionsAsync(): Promise<{ granted: boolean }>
  getExpoPushTokenAsync(): Promise<{ data: string }>
  setNotificationChannelAsync?(id: string, channel: { name: string; importance: number }): Promise<unknown>
  AndroidImportance?: { DEFAULT: number }
  IosAuthorizationStatus?: { PROVISIONAL: number }
}

export interface OnlinePlayersOptions {
  // The game's name on the server (its X-Game header) and the namespace its players are kept under on the device
  game: string
  serverUrl: string
  // The game's rules version (X-Rules-Version): the server only plays one, and turns any other away with a 426
  rulesVersion: string
  // expo-secure-store on a phone, so the players' keys live in the Keychain. Leave it out in a browser (the site's localStorage)
  secureStore?: SecureStoreModule
  // expo-notifications, for pushes. Leave it out for a game, or a platform, with none
  notifications?: PushModule
  // The name Android's notification settings show for the game's pushes (Android 8+ files every notification under a channel)
  channelName?: string
  // The name the server gets for a profile: its own by default. A game whose players are never shown by name can send its own instead
  nameOf?: (profile: OnlineProfile) => string
  // Where the players are kept, in place of the default above (tests)
  storage?: OnlineStorage
  fetch?: typeof fetch
}

export class OnlineError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export interface OnlinePlayers {
  // Reads the players kept on the device, once; every other method waits for it
  load(): Promise<void>
  // The players on this device, a profile each (from the last load or change; `subscribe` says when it changes)
  players(): readonly OnlinePlayer[]
  playerOf(profileId: string): OnlinePlayer | null
  // The profile's player, made the first time the profile goes online and renamed when its name has changed. A player the server no
  // longer knows is made again
  ensure(profile: OnlineProfile): Promise<OnlinePlayer>
  // A call to the game's server as the profile's player. A key the server no longer knows (401) forgets the player here, so the next
  // `ensure` makes a new one
  call<T>(profileId: string, method: string, path: string, body?: unknown): Promise<T>
  // A call with no player, or as any player's key (`token`)
  request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T>
  // Follows the roster: renames the players whose profile has a new name, and deletes from the server the players whose profile is
  // gone (deleted here, or in a sibling game sharing the roster). Call it only with the roster loaded, since a profile missing from it
  // loses its player. A deletion the server can't take now is tried again next time
  sync(profiles: readonly OnlineProfile[]): Promise<void>
  // Registers the device's push token for every player on it: asks for permission when `ask` (a profile's first match; never at
  // launch), otherwise only when it was given before. Without permission, offline or with no players, nothing happens
  registerPushes(ask: boolean): Promise<void>
  // Delete Online Data: deletes the profile's player from the server (or every player's), then forgets it here
  remove(profileId: string): Promise<void>
  removeAll(): Promise<void>
  // The profile a push is for: the server puts its player's id in each push's data
  profileOfPush(data: unknown): string | null
  subscribe(listener: () => void): () => void
}

const PUSH_CHANNEL = 'default'
const EMPTY: readonly OnlinePlayer[] = []

interface Kept {
  id: string
  token: string
  name: string
}

// The index of what's kept: the profiles with a player, and the players whose profile is gone and who are still to be deleted from
// the server. Each player is kept under a key of its own, so no one value grows with the roster
interface Index {
  live: string[]
  gone: string[]
}

export function createOnlinePlayers(options: OnlinePlayersOptions): OnlinePlayers {
  const { game, serverUrl, rulesVersion, notifications, channelName = 'Your move', nameOf = (profile) => profile.name } = options
  const storage = options.storage ?? defaultStorage(options.secureStore)
  const fetcher = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const indexKey = `${game}.online.players`
  const playerKey = (profileId: string) => `${game}.online.player.${profileId}`

  const live = new Map<string, Kept>()
  const gone = new Map<string, Kept>()
  // Players checked with the server since the app started: a known player is checked once before it's used, so a key the server lost
  // (a deleted player, a server started over) makes a new player then, not an error in the middle of a match
  const checked = new Set<string>()
  const making = new Map<string, Promise<OnlinePlayer>>()
  // Each profile's own name, from the roster `ensure` and `sync` are handed. Only in memory: the roster is the game's to keep
  const profileNames = new Map<string, string>()
  const listeners = new Set<() => void>()
  let snapshot: readonly OnlinePlayer[] = EMPTY
  let loading: Promise<void> | null = null

  const toPlayer = (profileId: string, kept: Kept): OnlinePlayer => ({ profileId, ...kept, profileName: profileNames.get(profileId) ?? kept.name })

  const changed = () => {
    snapshot = [...live].map(([profileId, kept]) => toPlayer(profileId, kept))
    for (const listener of listeners) listener()
  }

  // Notes the profile's own name, saying whether it's news for a player on the device
  const noteName = (profile: OnlineProfile) => {
    const was = profileNames.get(profile.id)
    profileNames.set(profile.id, profile.name)
    return live.has(profile.id) && was !== profile.name
  }

  async function writeIndex() {
    const index: Index = { live: [...live.keys()], gone: [...gone.keys()] }
    await storage.setItem(indexKey, JSON.stringify(index))
  }

  async function keep(profileId: string, kept: Kept) {
    live.set(profileId, kept)
    await storage.setItem(playerKey(profileId), JSON.stringify(kept))
    await writeIndex()
    changed()
  }

  async function drop(profileId: string) {
    const was = live.delete(profileId) || gone.delete(profileId)
    checked.delete(profileId)
    if (!was) return
    await storage.removeItem(playerKey(profileId)).catch(() => {})
    await writeIndex().catch(() => {})
    changed()
  }

  function load(): Promise<void> {
    loading ??= (async () => {
      let index: Index = { live: [], gone: [] }
      try {
        const raw = await storage.getItem(indexKey)
        if (raw) index = JSON.parse(raw) as Index
      } catch {
        // Nothing readable: no players yet
      }
      const read = async (profileId: string) => {
        try {
          const raw = await storage.getItem(playerKey(profileId))
          return raw ? (JSON.parse(raw) as Kept) : null
        } catch {
          return null
        }
      }
      for (const profileId of index.live ?? []) {
        const kept = await read(profileId)
        if (kept) live.set(profileId, kept)
      }
      for (const profileId of index.gone ?? []) {
        const kept = await read(profileId)
        if (kept) gone.set(profileId, kept)
      }
      changed()
    })()
    return loading
  }

  async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    let res: Response
    try {
      res = await fetcher(`${serverUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Game': game, 'X-Rules-Version': rulesVersion, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    } catch {
      throw new OnlineError(0, "Can't reach the server")
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: string }
    if (!res.ok) throw new OnlineError(res.status, json.error ?? `The server answered ${res.status}`)
    return json
  }

  async function call<T>(profileId: string, method: string, path: string, body?: unknown): Promise<T> {
    await load()
    const kept = live.get(profileId)
    if (!kept) throw new OnlineError(401, 'Not online')
    try {
      return await request<T>(method, path, body, kept.token)
    } catch (err) {
      if (err instanceof OnlineError && err.status === 401 && live.get(profileId)?.token === kept.token) await drop(profileId)
      throw err
    }
  }

  async function make(profile: OnlineProfile): Promise<OnlinePlayer> {
    const name = nameOf(profile)
    const known = live.get(profile.id)
    if (known) {
      try {
        if (known.name !== name) await call(profile.id, 'PATCH', '/players/me', { name })
        else if (!checked.has(profile.id)) await call(profile.id, 'GET', '/players/me')
        checked.add(profile.id)
        if (known.name !== name) await keep(profile.id, { ...known, name })
        return toPlayer(profile.id, { ...known, name })
      } catch (err) {
        // The server no longer knows them (`call` forgot them): a new player below
        if (!(err instanceof OnlineError && err.status === 401)) throw err
      }
    }
    const made = await request<{ player: { id: string; name: string }; token: string }>('POST', '/players', { name })
    const kept = { id: made.player.id, token: made.token, name: made.player.name }
    checked.add(profile.id)
    await keep(profile.id, kept)
    // A new player joins the device's pushes, if they were ever allowed
    void registerPushes(false)
    return toPlayer(profile.id, kept)
  }

  async function ensure(profile: OnlineProfile): Promise<OnlinePlayer> {
    await load()
    if (noteName(profile)) changed()
    const pending = making.get(profile.id)
    if (pending) return pending
    const run = make(profile).finally(() => making.delete(profile.id))
    making.set(profile.id, run)
    return run
  }

  // Deletes the players whose profile is gone from the server: a 401 or 404 means it already was. One the server can't be reached for
  // stays, to be tried again
  async function flushGone() {
    for (const [profileId, kept] of [...gone]) {
      try {
        await request('DELETE', '/players/me', undefined, kept.token)
      } catch (err) {
        if (!(err instanceof OnlineError) || (err.status !== 401 && err.status !== 404)) continue
      }
      await drop(profileId)
    }
  }

  async function sync(profiles: readonly OnlineProfile[]): Promise<void> {
    await load()
    const byId = new Map(profiles.map((profile) => [profile.id, profile]))
    let lost = false
    let renamed = false
    for (const profile of profiles) if (noteName(profile)) renamed = true
    for (const [profileId, kept] of [...live]) {
      const profile = byId.get(profileId)
      if (profile) {
        const name = nameOf(profile)
        if (name === kept.name) continue
        try {
          await call(profileId, 'PATCH', '/players/me', { name })
          await keep(profileId, { ...kept, name })
        } catch {
          // Renamed the next time it's used (`ensure`)
        }
        continue
      }
      live.delete(profileId)
      gone.set(profileId, kept)
      lost = true
    }
    if (lost) await writeIndex().catch(() => {})
    if (lost || renamed) changed()
    await flushGone()
  }

  async function registerPushes(ask: boolean): Promise<void> {
    if (!notifications || Platform.OS === 'web') return
    await load()
    if (live.size === 0) return
    try {
      if (Platform.OS === 'android' && notifications.setNotificationChannelAsync) await notifications.setNotificationChannelAsync(PUSH_CHANNEL, { name: channelName, importance: notifications.AndroidImportance?.DEFAULT ?? 3 })
      const current = await notifications.getPermissionsAsync()
      let allowed = current.granted || (notifications.IosAuthorizationStatus !== undefined && current.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL)
      if (!allowed && ask && current.canAskAgain) allowed = (await notifications.requestPermissionsAsync()).granted
      if (!allowed) return
      const { data } = await notifications.getExpoPushTokenAsync()
      const put = () => request('PUT', '/push-token', { pushToken: data, playerTokens: [...live.values()].map((kept) => kept.token) })
      try {
        await put()
      } catch (err) {
        if (!(err instanceof OnlineError && err.status === 401)) throw err
        // One of the keys is one the server no longer knows: find it (`call` forgets it) and send the rest
        for (const profileId of [...live.keys()]) await call(profileId, 'GET', '/players/me').catch(() => {})
        if (live.size > 0) await put()
      }
    } catch {
      // No pushes this time; the next launch tries again
    }
  }

  async function remove(profileId: string): Promise<void> {
    await load()
    const kept = live.get(profileId)
    if (!kept) return
    try {
      await request('DELETE', '/players/me', undefined, kept.token)
    } catch (err) {
      if (!(err instanceof OnlineError) || (err.status !== 401 && err.status !== 404)) throw err
    }
    await drop(profileId)
  }

  async function removeAll(): Promise<void> {
    await load()
    for (const profileId of [...live.keys()]) await remove(profileId)
    await flushGone()
  }

  return {
    load,
    players: () => snapshot,
    playerOf: (profileId) => {
      const kept = live.get(profileId)
      return kept ? toPlayer(profileId, kept) : null
    },
    ensure,
    call,
    request,
    sync,
    registerPushes,
    remove,
    removeAll,
    profileOfPush: (data) => {
      const playerId = (data as { playerId?: unknown } | null)?.playerId
      if (typeof playerId !== 'string') return null
      for (const [profileId, kept] of live) if (kept.id === playerId) return profileId
      return null
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
