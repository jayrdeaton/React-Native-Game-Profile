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

  // One profile is never on two seats: picking the other seat's profile swaps the two.
  describe('select on a profile another seat has', () => {
    it("swaps: the other seat takes this seat's previous profile", () => {
      const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      const initial: Record<Seat, string | null> = { 1: 'profile-1', 2: 'profile-2' }
      expect(reducer(initial, actions.select({ profileId: 'profile-2', seat: 1 }))).toEqual({ 1: 'profile-2', 2: 'profile-1' })
    })

    it('moves the other seat to guest when this seat had no profile', () => {
      const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      const initial: Record<Seat, string | null> = { 1: null, 2: 'profile-2' }
      expect(reducer(initial, actions.select({ profileId: 'profile-2', seat: 1 }))).toEqual({ 1: 'profile-2', 2: null })
    })

    it('works for string seat ids too', () => {
      type NamedSeat = 'p1' | 'p2'
      const { actions, reducer } = createProfileSelectionSlice<NamedSeat>('lobby', { p1: null, p2: null })
      const initial: Record<NamedSeat, string | null> = { p1: 'profile-1', p2: 'profile-2' }
      expect(reducer(initial, actions.select({ profileId: 'profile-1', seat: 'p2' }))).toEqual({ p1: 'profile-2', p2: 'profile-1' })
    })

    it('swaps with the right seat when there are more than two', () => {
      type ThreeSeats = 1 | 2 | 3
      const { actions, reducer } = createProfileSelectionSlice<ThreeSeats>('table', { 1: null, 2: null, 3: null })
      const initial: Record<ThreeSeats, string | null> = { 1: 'profile-1', 2: 'profile-2', 3: 'profile-3' }
      expect(reducer(initial, actions.select({ profileId: 'profile-3', seat: 1 }))).toEqual({ 1: 'profile-3', 2: 'profile-2', 3: 'profile-1' })
    })

    it('re-picking the profile a seat already has changes nothing', () => {
      const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      const initial: Record<Seat, string | null> = { 1: 'profile-1', 2: 'profile-2' }
      expect(reducer(initial, actions.select({ profileId: 'profile-1', seat: 1 }))).toEqual(initial)
    })

    it('a pick on a state already holding one profile on both seats leaves the other seat as guest', () => {
      const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      const initial: Record<Seat, string | null> = { 1: 'profile-1', 2: 'profile-1' }
      expect(reducer(initial, actions.select({ profileId: 'profile-1', seat: 1 }))).toEqual({ 1: 'profile-1', 2: null })
    })

    it('picking guest never moves another seat', () => {
      const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      const initial: Record<Seat, string | null> = { 1: 'profile-1', 2: null }
      expect(reducer(initial, actions.select({ profileId: null, seat: 2 }))).toEqual({ 1: 'profile-1', 2: null })
    })
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

  describe('pruneToRoster', () => {
    it('namespaces its action type under profileSelection/<namespace>/', () => {
      const { actions } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      expect(actions.pruneToRoster.type).toBe('profileSelection/loadout/pruneToRoster')
    })

    it('nulls a seat whose profile id is absent from the roster and leaves a present one', () => {
      const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      const initial: Record<Seat, string | null> = { 1: 'profile-1', 2: 'profile-2' }
      const state = reducer(initial, actions.pruneToRoster(['profile-2', 'profile-3']))
      expect(state).toEqual({ 1: null, 2: 'profile-2' })
    })

    it('leaves null seats null', () => {
      const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      const initial: Record<Seat, string | null> = { 1: null, 2: 'profile-2' }
      const state = reducer(initial, actions.pruneToRoster(['profile-1']))
      expect(state).toEqual({ 1: null, 2: null })
    })

    it('returns the identical state reference when every selected id is in the roster', () => {
      const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      const initial: Record<Seat, string | null> = { 1: 'profile-1', 2: null }
      expect(reducer(initial, actions.pruneToRoster(['profile-1', 'profile-2']))).toBe(initial)
    })

    it('clears every selected seat when the roster is empty', () => {
      const { actions, reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      const initial: Record<Seat, string | null> = { 1: 'profile-1', 2: 'profile-2' }
      const state = reducer(initial, actions.pruneToRoster([]))
      expect(state).toEqual({ 1: null, 2: null })
    })
  })

  describe('REHYDRATE', () => {
    it('backfills a seat missing from a persisted blob that predates it, instead of leaving it undefined', () => {
      const { reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      // Simulates redux-persist's own default stateReconciler (autoMergeLevel1) hard-replacing this
      // slice's state with a persisted blob from before seat 2 existed - no such key at all, not
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

    it('drops a profile saved on two seats from all but the first', () => {
      const { reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      const action = { type: 'persist/REHYDRATE', payload: { profileSelection: { 1: 'profile-1', 2: 'profile-1' } } }
      expect(reducer(defaultState, action)).toEqual({ 1: 'profile-1', 2: null })
    })

    it('leaves distinct and guest seats alone', () => {
      const { reducer } = createProfileSelectionSlice<Seat>('loadout', defaultState)
      const action = { type: 'persist/REHYDRATE', payload: { profileSelection: { 1: null, 2: 'profile-2' } } }
      expect(reducer(defaultState, action)).toEqual({ 1: null, 2: 'profile-2' })
    })
  })
})
