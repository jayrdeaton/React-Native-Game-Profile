import { createProfileRecord, profilesActions, profilesReducer } from '../redux/profilesSlice'
import { Profile } from '../types'

const ALICE: Profile = { color: '#2196f3', createdAt: 1000, id: 'profile-1', name: 'Alice', tag: '😎', updatedAt: 1000 }
const BOB: Profile = { color: '#ff0000', createdAt: 2000, id: 'profile-2', name: 'Bob', tag: 'BOB', updatedAt: 2000 }

describe('profilesActions', () => {
  it('namespaces every action type under profiles/', () => {
    expect(profilesActions.setAll.type).toBe('profiles/setAll')
    expect(profilesActions.add.type).toBe('profiles/add')
    expect(profilesActions.update.type).toBe('profiles/update')
    expect(profilesActions.remove.type).toBe('profiles/remove')
  })

  it('each creator returns an action carrying its payload and type', () => {
    expect(profilesActions.setAll([ALICE])).toEqual({ payload: [ALICE], type: 'profiles/setAll' })
    expect(profilesActions.add(ALICE)).toEqual({ payload: ALICE, type: 'profiles/add' })
    expect(profilesActions.update({ id: 'profile-1', patch: { name: 'Alicia' } })).toEqual({ payload: { id: 'profile-1', patch: { name: 'Alicia' } }, type: 'profiles/update' })
    expect(profilesActions.remove('profile-1')).toEqual({ payload: 'profile-1', type: 'profiles/remove' })
  })

  it('each creator.match only matches its own action type', () => {
    expect(profilesActions.setAll.match(profilesActions.setAll([]))).toBe(true)
    expect(profilesActions.setAll.match(profilesActions.add(ALICE))).toBe(false)
    expect(profilesActions.add.match(profilesActions.remove('profile-1'))).toBe(false)
  })
})

describe('profilesReducer', () => {
  it('defaults to an empty array when state is undefined', () => {
    expect(profilesReducer(undefined, { type: '@@INIT' })).toEqual([])
  })

  it('returns the existing state unchanged for an unrelated action', () => {
    const state = [ALICE]
    expect(profilesReducer(state, { type: 'unrelated/action' })).toBe(state)
  })

  it('setAll replaces the whole roster', () => {
    expect(profilesReducer([ALICE], profilesActions.setAll([BOB]))).toEqual([BOB])
  })

  it('add appends a profile without touching existing entries', () => {
    expect(profilesReducer([ALICE], profilesActions.add(BOB))).toEqual([ALICE, BOB])
  })

  it('update patches only the matching profile and stamps updatedAt', () => {
    const now = 5000
    jest.spyOn(Date, 'now').mockReturnValue(now)
    const state = profilesReducer([ALICE, BOB], profilesActions.update({ id: 'profile-1', patch: { name: 'Alicia' } }))
    expect(state).toEqual([{ ...ALICE, name: 'Alicia', updatedAt: now }, BOB])
    jest.restoreAllMocks()
  })

  it('update is a no-op when no profile matches the id', () => {
    const state = [ALICE]
    expect(profilesReducer(state, profilesActions.update({ id: 'missing', patch: { name: 'X' } }))).toEqual(state)
  })

  it('remove filters out only the matching profile', () => {
    expect(profilesReducer([ALICE, BOB], profilesActions.remove('profile-1'))).toEqual([BOB])
  })

  it('remove is a no-op when no profile matches the id', () => {
    const state = [ALICE]
    expect(profilesReducer(state, profilesActions.remove('missing'))).toEqual(state)
  })
})

describe('createProfileRecord', () => {
  it('builds a complete Profile from the given input, with fresh id and matching timestamps', () => {
    const now = 12345
    jest.spyOn(Date, 'now').mockReturnValue(now)
    const record = createProfileRecord({ color: '#00ff00', name: 'Carol', tag: 'C' })
    expect(record).toEqual({ color: '#00ff00', createdAt: now, id: expect.any(String), name: 'Carol', tag: 'C', updatedAt: now })
    expect(record.createdAt).toBe(record.updatedAt)
    jest.restoreAllMocks()
  })

  it('generates a different id on each call', () => {
    const first = createProfileRecord({ color: '#000', name: 'A', tag: '' })
    const second = createProfileRecord({ color: '#000', name: 'A', tag: '' })
    expect(first.id).not.toBe(second.id)
  })
})
