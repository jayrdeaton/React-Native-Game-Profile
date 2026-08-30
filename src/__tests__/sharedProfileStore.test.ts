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

const GROUP_ID = 'group.tastic.profile'

describe('sharedProfileStore — native module unavailable', () => {
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

  it('saveSharedProfiles is a no-op', async () => {
    const store = require('../sharedProfileStore')
    await expect(store.saveSharedProfiles(GROUP_ID, [VALID_PROFILE])).resolves.toBeUndefined()
  })
})

describe('sharedProfileStore — requireOptionalNativeModule throws at load time', () => {
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

describe('sharedProfileStore — native module available', () => {
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
})
