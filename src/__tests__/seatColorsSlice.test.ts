import { createSeatColorsSlice, type SeatColorsState } from '../redux/seatColorsSlice'

type Seat = 1 | 2

const defaultState: SeatColorsState<Seat> = {
  lastCpuColor: '#00FF00',
  lastGuestColor: { 1: '#FF0000', 2: '#00FF00' },
  profileOverride: { 1: null, 2: null }
}

describe('createSeatColorsSlice', () => {
  it('namespaces all three action types under seatColors/<namespace>/', () => {
    const { actions } = createSeatColorsSlice<Seat>('loadout', defaultState)
    expect(actions.setLastCpuColor.type).toBe('seatColors/loadout/setLastCpuColor')
    expect(actions.setLastGuestColor.type).toBe('seatColors/loadout/setLastGuestColor')
    expect(actions.setProfileOverride.type).toBe('seatColors/loadout/setProfileOverride')
  })

  it('two slices with different namespaces produce non-colliding action types', () => {
    const a = createSeatColorsSlice<Seat>('loadout', defaultState)
    const b = createSeatColorsSlice<Seat>('lobby', defaultState)
    expect(a.actions.setLastCpuColor.type).not.toBe(b.actions.setLastCpuColor.type)
    expect(a.actions.setLastCpuColor.match(b.actions.setLastCpuColor('#0000FF'))).toBe(false)
  })

  it('defaults to the given defaultState when state is undefined', () => {
    const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(defaultState)
  })

  it('returns the existing state unchanged for an unrelated action', () => {
    const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
    expect(reducer(defaultState, { type: 'unrelated/action' })).toBe(defaultState)
  })

  it('setLastCpuColor replaces lastCpuColor without touching other fields', () => {
    const { actions, reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
    const state = reducer(defaultState, actions.setLastCpuColor('#0000FF'))
    expect(state).toEqual({ ...defaultState, lastCpuColor: '#0000FF' })
  })

  it('setLastGuestColor sets the given seat without touching the other seat', () => {
    const { actions, reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
    const state = reducer(defaultState, actions.setLastGuestColor({ color: '#123456', seat: 1 }))
    expect(state).toEqual({ ...defaultState, lastGuestColor: { 1: '#123456', 2: '#00FF00' } })
  })

  it('setProfileOverride sets the given seat to a color without touching the other seat', () => {
    const { actions, reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
    const state = reducer(defaultState, actions.setProfileOverride({ color: '#ABCDEF', seat: 2 }))
    expect(state).toEqual({ ...defaultState, profileOverride: { 1: null, 2: '#ABCDEF' } })
  })

  it('setProfileOverride can clear a seat back to null', () => {
    const { actions, reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
    const initial: SeatColorsState<Seat> = { ...defaultState, profileOverride: { 1: '#ABCDEF', 2: null } }
    const state = reducer(initial, actions.setProfileOverride({ color: null, seat: 1 }))
    expect(state).toEqual({ ...defaultState, profileOverride: { 1: null, 2: null } })
  })

  describe('REHYDRATE', () => {
    it('backfills a field missing from a persisted blob that predates it, instead of leaving it undefined', () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      // Simulates redux-persist's own default stateReconciler (autoMergeLevel1) hard-replacing this
      // slice's state with a persisted blob from before `profileOverride` existed — no such key at
      // all, not even `undefined` explicitly, the same shape a real old AsyncStorage blob has.
      const staleState = { lastCpuColor: '#123456', lastGuestColor: { 1: '#111111', 2: '#222222' } } as SeatColorsState<Seat>
      const action = { type: 'persist/REHYDRATE', payload: { seatColors: staleState } }

      const state = reducer(staleState, action)

      expect(state.profileOverride).toEqual(defaultState.profileOverride)
      expect(state.lastCpuColor).toBe('#123456')
      expect(state.lastGuestColor).toEqual({ 1: '#111111', 2: '#222222' })
    })

    it('keeps every field from a persisted blob that already has the full shape', () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      const persisted: SeatColorsState<Seat> = { lastCpuColor: '#123456', lastGuestColor: { 1: '#111111', 2: '#222222' }, profileOverride: { 1: '#abcabc', 2: null } }
      const action = { type: 'persist/REHYDRATE', payload: { seatColors: persisted } }

      const state = reducer(defaultState, action)

      expect(state).toEqual(persisted)
    })

    it('falls back to defaultState when this slice has nothing in the persisted payload at all', () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      const action = { type: 'persist/REHYDRATE', payload: { theme: { appearance: 'system' } } }

      expect(reducer(defaultState, action)).toEqual(defaultState)
    })

    it('reads the persisted payload under a custom mountKey when one is passed', () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState, 'p1SeatColors')
      const persisted: SeatColorsState<Seat> = { lastCpuColor: '#654321', lastGuestColor: { 1: '#333333', 2: '#444444' }, profileOverride: { 1: null, 2: '#999999' } }
      const action = { type: 'persist/REHYDRATE', payload: { p1SeatColors: persisted, seatColors: defaultState } }

      expect(reducer(defaultState, action)).toEqual(persisted)
    })
  })
})
