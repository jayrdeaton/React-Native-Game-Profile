import { useAutoPaperTheme } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import { ConfirmDialog } from '@tastic/hud/chrome'
import { act, render } from '@testing-library/react'
import { Platform } from 'react-native'

import { createOnlinePlayers, OnlineError, type OnlinePlayers } from '../online/onlinePlayers'
import { ProfileOnlineSection } from '../online/ProfileOnlineSection'
import { defaultStorage, localStorageStorage, memoryStorage, secureStoreStorage } from '../online/storage'
import { useOnlinePlayersSync } from '../online/useOnlinePlayers'

jest.mock('@rific/auto-paper', () => ({ useAutoPaperTheme: jest.fn() }))
jest.mock('@rific/feedback-press', () => ({ TouchableRipple: jest.fn(({ children }: any) => children ?? null) }))
jest.mock('@tastic/hud/chrome', () => ({ ConfirmDialog: jest.fn(() => null) }))

const colors = { onSurface: '#fff', onSurfaceVariant: '#aaa', error: '#f00', errorContainer: '#400' }

// Players held in memory, standing in for createOnlinePlayers' (tested in onlinePlayers.test.ts)
function fakeOnline(names: string[], from = 0): OnlinePlayers & { remove: jest.Mock; removeAll: jest.Mock } {
  let players = names.map((name, i) => ({ profileId: `profile-${i + from}`, id: `p${i}`, token: `key-${i}`, name: 'CardTastic', profileName: name }))
  const listeners = new Set<() => void>()
  return {
    load: jest.fn(async () => {}),
    players: () => players,
    playerOf: () => null,
    ensure: jest.fn(),
    call: jest.fn(),
    request: jest.fn(),
    sync: jest.fn(async () => {}),
    registerPushes: jest.fn(async () => {}),
    remove: jest.fn(async (profileId: string) => {
      players = players.filter((p) => p.profileId !== profileId)
      for (const listener of listeners) listener()
    }),
    removeAll: jest.fn(async () => {
      players = []
      for (const listener of listeners) listener()
    }),
    profileOfPush: () => null,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

const lastProps = <T,>(mock: unknown) => (mock as jest.Mock).mock.calls.at(-1)?.[0] as T

describe('ProfileOnlineSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAutoPaperTheme as jest.Mock).mockReturnValue({ colors, dark: true })
  })

  const KID = { id: 'profile-0', name: 'Kid' }
  const SAM = { id: 'profile-1', name: 'Sam' }
  const deleteRow = () => (TouchableRipple as unknown as jest.Mock).mock.calls.map((call) => call[0]).findLast((props: { testID?: string }) => props.testID === 'profile-online-delete') as { onPress: () => void; accessibilityLabel: string }

  it('shows nothing until this profile has played online', () => {
    const { container } = render(<ProfileOnlineSection online={fakeOnline(['Sam'], 1)} profile={KID} />)
    expect(container.textContent).toBe('')
  })

  it("draws a game's own rows above Delete Online Data", () => {
    const { container } = render(
      <ProfileOnlineSection online={fakeOnline(['Kid'])} profile={KID}>
        <span>Show on Public Boards</span>
      </ProfileOnlineSection>
    )
    expect(container.textContent).toMatch(/^ONLINEShow on Public BoardsDelete Online Data/)
  })

  it("deletes only this profile's player once confirmed, saying the profile stays", async () => {
    const online = fakeOnline(['Kid', 'Sam'])
    const onDeleted = jest.fn()
    render(<ProfileOnlineSection online={online} profile={SAM} onDeleted={onDeleted} />)
    act(() => deleteRow().onPress())
    const dialog = lastProps<{ visible: boolean; title: string; message: string; destructive: boolean; onConfirm: () => void }>(ConfirmDialog)
    expect(dialog).toMatchObject({ visible: true, title: 'Delete Online Data?', destructive: true })
    expect(dialog.message).toBe("Sam's online player is deleted from the server. The profile stays on this device. This can't be undone.")
    await act(async () => dialog.onConfirm())
    expect(online.remove).toHaveBeenCalledWith(SAM.id)
    expect(onDeleted).toHaveBeenCalled()
  })

  it("takes the game's own confirm message", () => {
    render(<ProfileOnlineSection online={fakeOnline(['Kid'])} profile={KID} confirmMessage='Open matches count as forfeits.' />)
    act(() => deleteRow().onPress())
    expect(lastProps<{ message: string }>(ConfirmDialog).message).toBe('Open matches count as forfeits.')
  })

  it('says why when the server could not be reached', async () => {
    const online = fakeOnline(['Kid'])
    online.remove.mockRejectedValueOnce(new OnlineError(0, "Can't reach the server"))
    const onError = jest.fn()
    render(<ProfileOnlineSection online={online} profile={KID} onError={onError} />)
    act(() => deleteRow().onPress())
    await act(async () => lastProps<{ onConfirm: () => void }>(ConfirmDialog).onConfirm())
    expect(onError).toHaveBeenCalledWith("Can't reach the server")
  })
})

describe('useOnlinePlayersSync', () => {
  function Sync({ online, loaded }: { online: OnlinePlayers; loaded: boolean }) {
    useOnlinePlayersSync(online, [{ id: 'profile-0', name: 'Kid' }], loaded)
    return null
  }

  it('follows the roster and registers pushes only once it has loaded', async () => {
    const online = fakeOnline(['Kid'])
    const { rerender } = render(<Sync online={online} loaded={false} />)
    expect(online.sync).not.toHaveBeenCalled()
    await act(async () => rerender(<Sync online={online} loaded />))
    expect(online.sync).toHaveBeenCalledWith([{ id: 'profile-0', name: 'Kid' }])
    expect(online.registerPushes).toHaveBeenCalledWith(false)
  })
})

describe('storage', () => {
  it('keeps values in the Keychain, readable after the first unlock', async () => {
    const secureStore = { getItemAsync: jest.fn(async () => 'v'), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}), AFTER_FIRST_UNLOCK: 0 }
    const storage = secureStoreStorage(secureStore)
    await storage.setItem('k', 'v')
    await expect(storage.getItem('k')).resolves.toBe('v')
    await storage.removeItem('k')
    expect(secureStore.setItemAsync).toHaveBeenCalledWith('k', 'v', { keychainAccessible: 0 })
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('k', { keychainAccessible: 0 })
    expect(defaultStorage(secureStore)).not.toBeNull()
  })

  it('uses the site’s localStorage in a browser, and memory where there is nothing else', async () => {
    const browser = localStorageStorage()
    expect(browser).not.toBeNull()
    await browser?.setItem('hexfleet.online.players', '{}')
    expect(globalThis.localStorage.getItem('hexfleet.online.players')).toBe('{}')
    await browser?.removeItem('hexfleet.online.players')
    await expect(browser?.getItem('hexfleet.online.players')).resolves.toBeNull()
    ;(Platform as { OS: string }).OS = 'web'
    try {
      await defaultStorage(undefined).setItem('a', '1')
      expect(globalThis.localStorage.getItem('a')).toBe('1')
    } finally {
      ;(Platform as { OS: string }).OS = 'ios'
    }
    const memory = memoryStorage()
    await memory.setItem('a', '2')
    await expect(memory.getItem('a')).resolves.toBe('2')
  })

  it('keeps players only in memory on a phone with no secure store handed in', async () => {
    const online = createOnlinePlayers({ game: 'g', serverUrl: 'https://x', rulesVersion: '1', fetch: jest.fn() as never })
    await online.load()
    expect(online.players()).toEqual([])
  })
})
