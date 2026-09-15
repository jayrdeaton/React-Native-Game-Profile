import { Profile } from '../types'

const ALICE: Profile = { color: '#2196f3', createdAt: 1000, id: 'profile-1', name: 'Alice', tag: '😎', updatedAt: 1000 }
const BOB: Profile = { color: '#ff0000', createdAt: 2000, id: 'profile-2', name: 'Bob', tag: 'BOB', updatedAt: 2000 }
const GROUP_ID = 'group.tastic.profile'

describe('resolveInitialProfiles — shared store unavailable', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.doMock('../sharedProfileStore', () => ({
      isSharedProfileStoreAvailable: false,
      loadSharedProfiles: jest.fn(),
      saveSharedProfiles: jest.fn()
    }))
  })

  afterEach(() => {
    jest.dontMock('../sharedProfileStore')
  })

  it('returns localFallback verbatim without touching the shared store', async () => {
    const { resolveInitialProfiles } = require('../redux/resolveInitialProfiles')
    const { loadSharedProfiles } = require('../sharedProfileStore')
    await expect(resolveInitialProfiles(GROUP_ID, [ALICE])).resolves.toEqual([ALICE])
    expect(loadSharedProfiles).not.toHaveBeenCalled()
  })
})

describe('resolveInitialProfiles — shared store available', () => {
  afterEach(() => {
    jest.dontMock('../sharedProfileStore')
    jest.resetModules()
  })

  it('seeds the shared store from localFallback and returns it, when shared is empty and local is not', async () => {
    const saveSharedProfiles = jest.fn().mockResolvedValue(undefined)
    jest.resetModules()
    jest.doMock('../sharedProfileStore', () => ({
      isSharedProfileStoreAvailable: true,
      loadSharedProfiles: jest.fn().mockResolvedValue([]),
      saveSharedProfiles
    }))
    const { resolveInitialProfiles } = require('../redux/resolveInitialProfiles')
    await expect(resolveInitialProfiles(GROUP_ID, [ALICE])).resolves.toEqual([ALICE])
    expect(saveSharedProfiles).toHaveBeenCalledWith(GROUP_ID, [ALICE])
  })

  it('returns an empty roster when both shared and local are empty, without seeding', async () => {
    const saveSharedProfiles = jest.fn()
    jest.resetModules()
    jest.doMock('../sharedProfileStore', () => ({
      isSharedProfileStoreAvailable: true,
      loadSharedProfiles: jest.fn().mockResolvedValue([]),
      saveSharedProfiles
    }))
    const { resolveInitialProfiles } = require('../redux/resolveInitialProfiles')
    await expect(resolveInitialProfiles(GROUP_ID, [])).resolves.toEqual([])
    expect(saveSharedProfiles).not.toHaveBeenCalled()
  })

  it('shared wins over local when shared is non-empty, never merged', async () => {
    const saveSharedProfiles = jest.fn()
    jest.resetModules()
    jest.doMock('../sharedProfileStore', () => ({
      isSharedProfileStoreAvailable: true,
      loadSharedProfiles: jest.fn().mockResolvedValue([BOB]),
      saveSharedProfiles
    }))
    const { resolveInitialProfiles } = require('../redux/resolveInitialProfiles')
    await expect(resolveInitialProfiles(GROUP_ID, [ALICE])).resolves.toEqual([BOB])
    expect(saveSharedProfiles).not.toHaveBeenCalled()
  })

  it('a failed seed write is swallowed, still resolving with localFallback', async () => {
    jest.resetModules()
    jest.doMock('../sharedProfileStore', () => ({
      isSharedProfileStoreAvailable: true,
      loadSharedProfiles: jest.fn().mockResolvedValue([]),
      saveSharedProfiles: jest.fn().mockRejectedValue(new Error('write failed'))
    }))
    const { resolveInitialProfiles } = require('../redux/resolveInitialProfiles')
    await expect(resolveInitialProfiles(GROUP_ID, [ALICE])).resolves.toEqual([ALICE])
  })
})
