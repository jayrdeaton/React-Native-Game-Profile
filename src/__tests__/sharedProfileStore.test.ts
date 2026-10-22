import { Profile } from '../types'

const VALID_PROFILE: Profile = {
  id: 'profile-1',
  name: 'Alice',
  color: '#2196f3',
  tag: '😎',
  createdAt: 1000,
  updatedAt: 1000
}

const OTHER_VALID_PROFILE: Profile = {
  id: 'profile-2',
  name: 'Bob',
  color: '#ff0000',
  tag: 'BOB',
  createdAt: 2000,
  updatedAt: 2000
}

// A profile from a newer app whose rules this version doesn't accept (a four-letter tag), and an
// entry no app could use (no id).
const NEWER_APP_PROFILE = { ...OTHER_VALID_PROFILE, id: 'profile-3', name: 'Cleo', tag: 'CLEO' }
const NO_ID_ENTRY = { name: 'Nobody', color: '#000000', tag: '', createdAt: 1, updatedAt: 1 }

const GROUP_ID = 'group.tastic.profile'

describe('sharedProfileStore - native module unavailable', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: jest.fn(() => null)
    }))
  })

  afterEach(() => {
    jest.dontMock('expo-modules-core')
  })

  it('isSharedProfileStoreAvailable is false', () => {
    const store = require('../sharedProfileStore')
    expect(store.isSharedProfileStoreAvailable).toBe(false)
  })

  it('loadSharedProfiles resolves to [] without touching the native module', async () => {
    const store = require('../sharedProfileStore')
    await expect(store.loadSharedProfiles(GROUP_ID)).resolves.toEqual([])
  })

  it('readSharedProfiles resolves to [] (nothing shared), not null (a failed read)', async () => {
    const store = require('../sharedProfileStore')
    await expect(store.readSharedProfiles(GROUP_ID)).resolves.toEqual([])
  })

  it('saveSharedProfiles is a no-op', async () => {
    const store = require('../sharedProfileStore')
    await expect(store.saveSharedProfiles(GROUP_ID, [VALID_PROFILE])).resolves.toBeUndefined()
  })
})

describe('sharedProfileStore - requireOptionalNativeModule throws at load time', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: jest.fn(() => {
        throw new Error('native module registry unavailable')
      })
    }))
  })

  afterEach(() => {
    jest.dontMock('expo-modules-core')
  })

  it('degrades to unavailable instead of throwing on import', () => {
    expect(() => require('../sharedProfileStore')).not.toThrow()
    const store = require('../sharedProfileStore')
    expect(store.isSharedProfileStoreAvailable).toBe(false)
  })
})

describe('sharedProfileStore - native module available', () => {
  const getSharedJSON = jest.fn()
  const setSharedJSON = jest.fn()

  beforeEach(() => {
    jest.resetModules()
    getSharedJSON.mockReset()
    setSharedJSON.mockReset()
    jest.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: jest.fn(() => ({ getSharedJSON, setSharedJSON }))
    }))
  })

  afterEach(() => {
    jest.dontMock('expo-modules-core')
  })

  it('isSharedProfileStoreAvailable is true', () => {
    const store = require('../sharedProfileStore')
    expect(store.isSharedProfileStoreAvailable).toBe(true)
  })

  it('loadSharedProfiles returns [] when the stored blob is null', async () => {
    getSharedJSON.mockResolvedValue(null)
    const store = require('../sharedProfileStore')
    await expect(store.loadSharedProfiles(GROUP_ID)).resolves.toEqual([])
    expect(getSharedJSON).toHaveBeenCalledWith(GROUP_ID, 'sharedProfiles')
  })

  it('loadSharedProfiles returns [] when the stored blob is an empty string', async () => {
    getSharedJSON.mockResolvedValue('')
    const store = require('../sharedProfileStore')
    await expect(store.loadSharedProfiles(GROUP_ID)).resolves.toEqual([])
  })

  it('loadSharedProfiles returns [] when the stored blob is corrupt JSON', async () => {
    getSharedJSON.mockResolvedValue('{not valid json')
    const store = require('../sharedProfileStore')
    await expect(store.loadSharedProfiles(GROUP_ID)).resolves.toEqual([])
  })

  it('loadSharedProfiles returns [] when the parsed JSON is not an array', async () => {
    getSharedJSON.mockResolvedValue(JSON.stringify({ not: 'an array' }))
    const store = require('../sharedProfileStore')
    await expect(store.loadSharedProfiles(GROUP_ID)).resolves.toEqual([])
  })

  it('loadSharedProfiles returns [] when the native call itself throws', async () => {
    getSharedJSON.mockRejectedValue(new Error('app group read failed'))
    const store = require('../sharedProfileStore')
    await expect(store.loadSharedProfiles(GROUP_ID)).resolves.toEqual([])
  })

  it('loadSharedProfiles returns the full roster when every entry is valid', async () => {
    getSharedJSON.mockResolvedValue(JSON.stringify([VALID_PROFILE, OTHER_VALID_PROFILE]))
    const store = require('../sharedProfileStore')
    await expect(store.loadSharedProfiles(GROUP_ID)).resolves.toEqual([VALID_PROFILE, OTHER_VALID_PROFILE])
  })

  it('drops only the invalid entries, keeping valid ones from an otherwise-valid roster', async () => {
    const invalidEntry = { ...VALID_PROFILE, id: 'profile-bad', color: 'not-a-hex-color' }
    getSharedJSON.mockResolvedValue(JSON.stringify([VALID_PROFILE, invalidEntry, OTHER_VALID_PROFILE]))
    const store = require('../sharedProfileStore')
    await expect(store.loadSharedProfiles(GROUP_ID)).resolves.toEqual([VALID_PROFILE, OTHER_VALID_PROFILE])
  })

  it('loadSharedProfiles returns [] when every stored entry is invalid', async () => {
    getSharedJSON.mockResolvedValue(JSON.stringify([{ ...VALID_PROFILE, color: 'not-a-hex-color' }]))
    const store = require('../sharedProfileStore')
    await expect(store.loadSharedProfiles(GROUP_ID)).resolves.toEqual([])
  })

  // A failed read is null, never [], so a caller can't mistake it for an empty roster and wipe the
  // shared store with its next write.
  describe('readSharedProfiles', () => {
    it('resolves to [] when nothing has been shared yet', async () => {
      getSharedJSON.mockResolvedValue(null)
      const store = require('../sharedProfileStore')
      await expect(store.readSharedProfiles(GROUP_ID)).resolves.toEqual([])
      expect(getSharedJSON).toHaveBeenCalledWith(GROUP_ID, 'sharedProfiles')
    })

    it('resolves to [] when the stored blob is an empty string', async () => {
      getSharedJSON.mockResolvedValue('')
      const store = require('../sharedProfileStore')
      await expect(store.readSharedProfiles(GROUP_ID)).resolves.toEqual([])
    })

    it('resolves to [] for a stored empty roster', async () => {
      getSharedJSON.mockResolvedValue('[]')
      const store = require('../sharedProfileStore')
      await expect(store.readSharedProfiles(GROUP_ID)).resolves.toEqual([])
    })

    it('resolves to null when the native call throws', async () => {
      getSharedJSON.mockRejectedValue(new Error('app group read failed'))
      const store = require('../sharedProfileStore')
      await expect(store.readSharedProfiles(GROUP_ID)).resolves.toBeNull()
    })

    it('resolves to null when the stored blob is corrupt JSON', async () => {
      getSharedJSON.mockResolvedValue('{not valid json')
      const store = require('../sharedProfileStore')
      await expect(store.readSharedProfiles(GROUP_ID)).resolves.toBeNull()
    })

    it('resolves to null when the parsed JSON is not an array', async () => {
      getSharedJSON.mockResolvedValue(JSON.stringify({ not: 'an array' }))
      const store = require('../sharedProfileStore')
      await expect(store.readSharedProfiles(GROUP_ID)).resolves.toBeNull()
    })

    it('resolves to null when the roster has entries and none of them are valid', async () => {
      getSharedJSON.mockResolvedValue(JSON.stringify([{ ...VALID_PROFILE, color: 'not-a-hex-color' }, { not: 'a profile' }]))
      const store = require('../sharedProfileStore')
      await expect(store.readSharedProfiles(GROUP_ID)).resolves.toBeNull()
    })

    it('keeps the valid entries when only some are invalid', async () => {
      const invalidEntry = { ...VALID_PROFILE, id: 'profile-bad', color: 'not-a-hex-color' }
      getSharedJSON.mockResolvedValue(JSON.stringify([VALID_PROFILE, invalidEntry, OTHER_VALID_PROFILE]))
      const store = require('../sharedProfileStore')
      await expect(store.readSharedProfiles(GROUP_ID)).resolves.toEqual([VALID_PROFILE, OTHER_VALID_PROFILE])
    })
  })

  it('saveSharedProfiles writes the JSON-serialized roster under the shared profiles key', async () => {
    setSharedJSON.mockResolvedValue(undefined)
    const store = require('../sharedProfileStore')
    await store.saveSharedProfiles(GROUP_ID, [VALID_PROFILE, OTHER_VALID_PROFILE])
    expect(setSharedJSON).toHaveBeenCalledWith(GROUP_ID, 'sharedProfiles', JSON.stringify([VALID_PROFILE, OTHER_VALID_PROFILE]))
  })

  it('saveSharedProfiles swallows a native write error instead of throwing', async () => {
    setSharedJSON.mockRejectedValue(new Error('app group write failed'))
    const store = require('../sharedProfileStore')
    await expect(store.saveSharedProfiles(GROUP_ID, [VALID_PROFILE])).resolves.toBeUndefined()
  })

  // An app can't read a newer app's profile under a rule loosened since, so it never had it in its
  // roster: a save that left it out would delete it for every app in the group.
  describe('entries this version cannot read', () => {
    it('reads past them, and a save writes them back after the roster', async () => {
      getSharedJSON.mockResolvedValue(JSON.stringify([VALID_PROFILE, NEWER_APP_PROFILE]))
      setSharedJSON.mockResolvedValue(undefined)
      const store = require('../sharedProfileStore')
      await expect(store.readSharedProfiles(GROUP_ID)).resolves.toEqual([VALID_PROFILE])
      await store.saveSharedProfiles(GROUP_ID, [VALID_PROFILE, OTHER_VALID_PROFILE])
      expect(setSharedJSON).toHaveBeenCalledWith(GROUP_ID, 'sharedProfiles', JSON.stringify([VALID_PROFILE, OTHER_VALID_PROFILE, NEWER_APP_PROFILE]))
    })

    it("lets the app's own profile replace one with the same id", async () => {
      const fixed = { ...NEWER_APP_PROFILE, tag: 'C' }
      getSharedJSON.mockResolvedValue(JSON.stringify([NEWER_APP_PROFILE]))
      setSharedJSON.mockResolvedValue(undefined)
      const store = require('../sharedProfileStore')
      await store.saveSharedProfiles(GROUP_ID, [fixed])
      expect(setSharedJSON).toHaveBeenCalledWith(GROUP_ID, 'sharedProfiles', JSON.stringify([fixed]))
    })

    it('drops an entry with no id, which no app can use', async () => {
      getSharedJSON.mockResolvedValue(JSON.stringify([NO_ID_ENTRY, NEWER_APP_PROFILE, 'junk', null]))
      setSharedJSON.mockResolvedValue(undefined)
      const store = require('../sharedProfileStore')
      await store.saveSharedProfiles(GROUP_ID, [VALID_PROFILE])
      expect(setSharedJSON).toHaveBeenCalledWith(GROUP_ID, 'sharedProfiles', JSON.stringify([VALID_PROFILE, NEWER_APP_PROFILE]))
    })

    it('still saves the roster when the stored one cannot be read', async () => {
      getSharedJSON.mockRejectedValue(new Error('app group read failed'))
      setSharedJSON.mockResolvedValue(undefined)
      const store = require('../sharedProfileStore')
      await store.saveSharedProfiles(GROUP_ID, [VALID_PROFILE])
      expect(setSharedJSON).toHaveBeenCalledWith(GROUP_ID, 'sharedProfiles', JSON.stringify([VALID_PROFILE]))

      getSharedJSON.mockResolvedValue('{not json')
      await store.saveSharedProfiles(GROUP_ID, [OTHER_VALID_PROFILE])
      expect(setSharedJSON).toHaveBeenLastCalledWith(GROUP_ID, 'sharedProfiles', JSON.stringify([OTHER_VALID_PROFILE]))
    })
  })
})

// The web build's store: every game in the group is served from one origin, so localStorage plays the
// App Group's part. Platform.OS is set on the fresh react-native mock that resetModules hands the store.
describe('sharedProfileStore - web', () => {
  const STORAGE_KEY = `${GROUP_ID}:sharedProfiles`

  const loadWebStore = (os: 'web' | 'ios' = 'web') => {
    require('react-native').Platform.OS = os
    return require('../sharedProfileStore')
  }

  beforeEach(() => {
    jest.resetModules()
    jest.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: jest.fn(() => null)
    }))
    localStorage.clear()
  })

  afterEach(() => {
    jest.dontMock('expo-modules-core')
    jest.restoreAllMocks()
  })

  it('is available on the web and stores the roster under the group id', async () => {
    const store = loadWebStore()
    expect(store.isSharedProfileStoreAvailable).toBe(true)
    await store.saveSharedProfiles(GROUP_ID, [VALID_PROFILE, OTHER_VALID_PROFILE])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual([VALID_PROFILE, OTHER_VALID_PROFILE])
    await expect(store.readSharedProfiles(GROUP_ID)).resolves.toEqual([VALID_PROFILE, OTHER_VALID_PROFILE])
  })

  it('reads [] when nothing has been shared and null for a blob that is not a roster', async () => {
    const store = loadWebStore()
    await expect(store.readSharedProfiles(GROUP_ID)).resolves.toEqual([])
    localStorage.setItem(STORAGE_KEY, '{not json')
    await expect(store.readSharedProfiles(GROUP_ID)).resolves.toBeNull()
  })

  it('stays unavailable off the web when there is no native module', () => {
    expect(loadWebStore('ios').isSharedProfileStoreAvailable).toBe(false)
  })

  it('stays unavailable when touching localStorage throws (storage blocked)', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      }
    })
    try {
      expect(loadWebStore().isSharedProfileStoreAvailable).toBe(false)
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original)
      else delete (globalThis as { localStorage?: Storage }).localStorage
    }
  })

  it('stays unavailable when localStorage takes no writes, so a save can never silently wipe the roster', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(loadWebStore().isSharedProfileStoreAvailable).toBe(false)
  })

  it('fails reads after a failed write, until a write succeeds, so an older roster cannot undo a local change', async () => {
    const store = loadWebStore()
    await store.saveSharedProfiles(GROUP_ID, [VALID_PROFILE])

    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    await expect(store.saveSharedProfiles(GROUP_ID, [VALID_PROFILE, OTHER_VALID_PROFILE])).resolves.toBeUndefined()
    await expect(store.readSharedProfiles(GROUP_ID)).resolves.toBeNull()

    setItem.mockRestore()
    await store.saveSharedProfiles(GROUP_ID, [OTHER_VALID_PROFILE])
    await expect(store.readSharedProfiles(GROUP_ID)).resolves.toEqual([OTHER_VALID_PROFILE])
  })

  it("keeps a newer app's profile it cannot read through a save, after a failed write too", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([VALID_PROFILE, NEWER_APP_PROFILE]))
    const store = loadWebStore()
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError')
    })
    await store.saveSharedProfiles(GROUP_ID, [VALID_PROFILE])
    // The failed write's latch fails reads until a write succeeds; the save past it still finds the entry.
    await expect(store.readSharedProfiles(GROUP_ID)).resolves.toBeNull()
    setItem.mockRestore()
    await store.saveSharedProfiles(GROUP_ID, [OTHER_VALID_PROFILE])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual([OTHER_VALID_PROFILE, NEWER_APP_PROFILE])
  })

  describe('subscribeSharedProfiles', () => {
    const storageEvent = (init: StorageEventInit) => window.dispatchEvent(new StorageEvent('storage', { storageArea: localStorage, ...init }))

    it('hands the listener the roster another tab saved, until unsubscribed', () => {
      const store = loadWebStore()
      const listener = jest.fn()
      const unsubscribe = store.subscribeSharedProfiles(GROUP_ID, listener)

      storageEvent({ key: STORAGE_KEY, newValue: JSON.stringify([VALID_PROFILE]) })
      expect(listener).toHaveBeenCalledWith([VALID_PROFILE])

      unsubscribe()
      storageEvent({ key: STORAGE_KEY, newValue: JSON.stringify([OTHER_VALID_PROFILE]) })
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it("ignores another key, the key's removal, a clear, and a blob that is not a roster", () => {
      const store = loadWebStore()
      const listener = jest.fn()
      store.subscribeSharedProfiles(GROUP_ID, listener)

      storageEvent({ key: 'snake:root', newValue: '{}' })
      storageEvent({ key: STORAGE_KEY, newValue: null })
      storageEvent({ key: null, newValue: null })
      storageEvent({ key: STORAGE_KEY, newValue: '{not json' })
      expect(listener).not.toHaveBeenCalled()
    })

    it('does nothing when the store is not the web one', () => {
      const store = loadWebStore('ios')
      const listener = jest.fn()
      const unsubscribe = store.subscribeSharedProfiles(GROUP_ID, listener)
      storageEvent({ key: STORAGE_KEY, newValue: JSON.stringify([VALID_PROFILE]) })
      expect(listener).not.toHaveBeenCalled()
      expect(unsubscribe).not.toThrow()
    })
  })
})
