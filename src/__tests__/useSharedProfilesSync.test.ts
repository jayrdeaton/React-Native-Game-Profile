import { act, renderHook } from '@testing-library/react'
import { AppState } from 'react-native'

import { useSharedProfilesSync } from '../redux/useSharedProfilesSync'
import { Profile } from '../types'

jest.mock('../sharedProfileStore', () => ({
  isSharedProfileStoreAvailable: true,
  readSharedProfiles: jest.fn(),
  saveSharedProfiles: jest.fn()
}))

// A single mocked module instance for the whole file (not re-required per test) - toggling
// isSharedProfileStoreAvailable by mutating this object's property, rather than
// jest.resetModules() + a fresh require(), is what the "unavailable" describe block below relies
// on: resetModules() would also clear React's own module cache, and a hook rendered against that
// second React instance while @testing-library/react still holds the first crashes with "Invalid
// hook call" (two copies of React in the same render). TypeScript's CJS emit for a named import
// keeps every use site as a property read off the whole module object rather than a
// destructured-at-import-time local, so mutating this property here is visible to
// useSharedProfilesSync.ts's own already-imported `isSharedProfileStoreAvailable` reads.
const mockedStore = jest.requireMock('../sharedProfileStore') as {
  isSharedProfileStoreAvailable: boolean
  readSharedProfiles: jest.Mock
  saveSharedProfiles: jest.Mock
}
const { readSharedProfiles, saveSharedProfiles } = mockedStore

const GROUP_ID = 'group.tastic.profile'
const ALICE: Profile = { color: '#2196f3', createdAt: 1000, id: 'profile-1', name: 'Alice', tag: '😎', updatedAt: 1000 }

const mockAddEventListener = AppState.addEventListener as jest.Mock

function fireAppStateChange(nextState: string) {
  const handler = mockAddEventListener.mock.calls[mockAddEventListener.mock.calls.length - 1][1] as (state: string) => void
  return act(async () => {
    handler(nextState)
    await Promise.resolve()
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useSharedProfilesSync - shared store available', () => {
  it('subscribes to AppState changes on mount and unsubscribes on unmount', () => {
    const remove = jest.fn()
    mockAddEventListener.mockReturnValue({ remove })
    const { unmount } = renderHook(() => useSharedProfilesSync({ groupId: GROUP_ID, onRemoteChange: jest.fn() }))
    expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    unmount()
    expect(remove).toHaveBeenCalled()
  })

  it('calls onRemoteChange with a freshly-loaded roster when the app becomes active', async () => {
    readSharedProfiles.mockResolvedValue([ALICE])
    const onRemoteChange = jest.fn()
    renderHook(() => useSharedProfilesSync({ groupId: GROUP_ID, onRemoteChange }))
    await fireAppStateChange('active')
    expect(readSharedProfiles).toHaveBeenCalledWith(GROUP_ID)
    expect(onRemoteChange).toHaveBeenCalledWith([ALICE])
  })

  it('skips onRemoteChange when the shared roster could not be read', async () => {
    readSharedProfiles.mockResolvedValue(null)
    const onRemoteChange = jest.fn()
    renderHook(() => useSharedProfilesSync({ groupId: GROUP_ID, onRemoteChange }))
    await fireAppStateChange('active')
    expect(readSharedProfiles).toHaveBeenCalledWith(GROUP_ID)
    expect(onRemoteChange).not.toHaveBeenCalled()
  })

  it('still calls onRemoteChange with an empty roster that was read successfully', async () => {
    readSharedProfiles.mockResolvedValue([])
    const onRemoteChange = jest.fn()
    renderHook(() => useSharedProfilesSync({ groupId: GROUP_ID, onRemoteChange }))
    await fireAppStateChange('active')
    expect(onRemoteChange).toHaveBeenCalledWith([])
  })

  it('ignores a change to a non-active state', async () => {
    const onRemoteChange = jest.fn()
    renderHook(() => useSharedProfilesSync({ groupId: GROUP_ID, onRemoteChange }))
    await fireAppStateChange('background')
    expect(readSharedProfiles).not.toHaveBeenCalled()
    expect(onRemoteChange).not.toHaveBeenCalled()
  })

  it('always calls the latest onRemoteChange, not whichever was passed on first mount', async () => {
    readSharedProfiles.mockResolvedValue([ALICE])
    const first = jest.fn()
    const second = jest.fn()
    const { rerender } = renderHook(({ onRemoteChange }) => useSharedProfilesSync({ groupId: GROUP_ID, onRemoteChange }), { initialProps: { onRemoteChange: first } })
    rerender({ onRemoteChange: second })
    await fireAppStateChange('active')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith([ALICE])
  })

  it('syncToShared writes to the shared store', () => {
    saveSharedProfiles.mockResolvedValue(undefined)
    const { result } = renderHook(() => useSharedProfilesSync({ groupId: GROUP_ID, onRemoteChange: jest.fn() }))
    act(() => {
      result.current.syncToShared([ALICE])
    })
    expect(saveSharedProfiles).toHaveBeenCalledWith(GROUP_ID, [ALICE])
  })

  it('skips a foreground refresh while a syncToShared write is still in flight', async () => {
    let resolveWrite: () => void = () => {}
    saveSharedProfiles.mockReturnValue(new Promise<void>((resolve) => (resolveWrite = resolve)))
    const onRemoteChange = jest.fn()
    const { result } = renderHook(() => useSharedProfilesSync({ groupId: GROUP_ID, onRemoteChange }))

    act(() => {
      result.current.syncToShared([ALICE])
    })
    await fireAppStateChange('active')
    expect(readSharedProfiles).not.toHaveBeenCalled()

    await act(async () => {
      resolveWrite()
      await Promise.resolve()
    })
  })

  it('a later foreground refresh (after the pending write settles) does call onRemoteChange again', async () => {
    saveSharedProfiles.mockResolvedValue(undefined)
    readSharedProfiles.mockResolvedValue([ALICE])
    const onRemoteChange = jest.fn()
    const { result } = renderHook(() => useSharedProfilesSync({ groupId: GROUP_ID, onRemoteChange }))

    await act(async () => {
      result.current.syncToShared([ALICE])
      await Promise.resolve()
      await Promise.resolve()
    })
    await fireAppStateChange('active')
    expect(onRemoteChange).toHaveBeenCalledWith([ALICE])
  })

  it('does not call onRemoteChange again after unmount, even if a load was already in flight', async () => {
    let resolveLoad: (profiles: Profile[]) => void = () => {}
    readSharedProfiles.mockReturnValue(new Promise<Profile[]>((resolve) => (resolveLoad = resolve)))
    const onRemoteChange = jest.fn()
    const { unmount } = renderHook(() => useSharedProfilesSync({ groupId: GROUP_ID, onRemoteChange }))

    const handler = mockAddEventListener.mock.calls[mockAddEventListener.mock.calls.length - 1][1] as (state: string) => void
    act(() => {
      handler('active')
    })
    unmount()
    await act(async () => {
      resolveLoad([ALICE])
      await Promise.resolve()
    })
    expect(onRemoteChange).not.toHaveBeenCalled()
  })
})

describe('useSharedProfilesSync - shared store unavailable', () => {
  beforeEach(() => {
    mockedStore.isSharedProfileStoreAvailable = false
  })

  afterEach(() => {
    mockedStore.isSharedProfileStoreAvailable = true
  })

  it('never subscribes to AppState', () => {
    renderHook(() => useSharedProfilesSync({ groupId: GROUP_ID, onRemoteChange: jest.fn() }))
    expect(mockAddEventListener).not.toHaveBeenCalled()
  })

  it('syncToShared is a no-op', () => {
    const { result } = renderHook(() => useSharedProfilesSync({ groupId: GROUP_ID, onRemoteChange: jest.fn() }))
    act(() => {
      result.current.syncToShared([ALICE])
    })
    expect(saveSharedProfiles).not.toHaveBeenCalled()
  })
})
