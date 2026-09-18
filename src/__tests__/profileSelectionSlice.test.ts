import { createProfileSelectionSlice } from '../redux/profileSelectionSlice'

type Seat = 1 | 2

const defaultState: Record<Seat, string | null> = { 1: null, 2: null }

describe('createProfileSelectionSlice', () => {
  it('namespaces both action types under profileSelection/<namespace>/', () => {
    const { actions } = createProfileSelectionSlice<Seat>('loadout', defaultState)
    expect(actions.select.type).toBe('profileSelection/loadout/select')
    expect(actions.clearProfile.type).toBe('profileSelection/loadout/clearProfile')
  })

  it('two slices with different namespaces produce non-colliding action types', () => {
    const a = createProfileSelectionSlice<Seat>('loadout', defaultState)
    const b = createProfileSelectionSlice<Seat>('lobby', defaultState)
    expect(a.actions.select.type).not.toBe(b.actions.select.type)
    expect(a.actions.select.match(b.actions.select({ profileId: 'profile-1', seat: 1 }))).toBe(false)
  })

  it('defaults to the given defaultState when state is undefined', () => {
    const { reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ 1: null, 2: null })
  })

  it('returns the existing state unchanged for an unrelated action', () => {
    const { reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
    const state: Record<Seat, string | null> = { 1: 'profile-1', 2: null }
    expect(reducer(state, { type: 'unrelated/action' })).toBe(state)
  })

  it('select sets the given seat to the given profile id without touching other seats', () => {
    const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
    const state = reducer(defaultState, actions.select({ profileId: 'profile-1', seat: 1 }))
    expect(state).toEqual({ 1: 'profile-1', 2: null })
  })

  it('select can clear a seat back to null', () => {
    const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
    const initial: Record<Seat, string | null> = { 1: 'profile-1', 2: null }
    const state = reducer(initial, actions.select({ profileId: null, seat: 1 }))
    expect(state).toEqual({ 1: null, 2: null })
  })

  it('clearProfile nulls out every seat pointing at the given profile id', () => {
    const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
    const initial: Record<Seat, string | null> = { 1: 'profile-1', 2: 'profile-1' }
    const state = reducer(initial, actions.clearProfile('profile-1'))
    expect(state).toEqual({ 1: null, 2: null })
  })

  it('clearProfile leaves seats pointing at a different profile id untouched', () => {
    const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
    const initial: Record<Seat, string | null> = { 1: 'profile-1', 2: 'profile-2' }
    const state = reducer(initial, actions.clearProfile('profile-1'))
    expect(state).toEqual({ 1: null, 2: 'profile-2' })
  })

  it('clearProfile is a no-op when no seat points at the given profile id', () => {
    const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
    const initial: Record<Seat, string | null> = { 1: 'profile-1', 2: 'profile-2' }
    expect(reducer(initial, actions.clearProfile('missing'))).toEqual(initial)
  })

  describe('REHYDRATE', () => {
    it('backfills a seat missing from a persisted blob that predates it, instead of leaving it undefined', () => {
      const { reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      // Simulates redux-persist's own default stateReconciler (autoMergeLevel1) hard-replacing this
      // slice's state with a persisted blob from before seat 2 existed — no such key at all, not
      // even `undefined` explicitly, the same shape a real old AsyncStorage blob has.
      const staleState = { 1: 'profile-1' } as Record<Seat, string | null>
      const action = { type: 'persist/REHYDRATE', payload: { profileSelection: staleState } }

      const state = reducer(staleState, action)

      expect(state[2]).toBe(defaultState[2])
      expect(state[1]).toBe('profile-1')
    })

    it('reads the persisted payload under a custom mountKey when one is passed', () => {
      const { reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState, 'p1ProfileSelection')
      const persisted: Record<Seat, string | null> = { 1: 'profile-9', 2: null }
      const action = { type: 'persist/REHYDRATE', payload: { p1ProfileSelection: persisted, profileSelection: { 1: 'wrong-profile', 2: 'wrong-profile' } } }

      expect(reducer(defaultState, action)).toEqual(persisted)
    })
  })
})
