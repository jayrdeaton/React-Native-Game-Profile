import { profilesActions } from '../redux/profilesSlice'
import { createSeatColorsSlice, profileSeatColor, type SeatColorsState } from '../redux/seatColorsSlice'
import { Profile } from '../types'

type Seat = 1 | 2

const defaultState: SeatColorsState<Seat> = {
  lastCpuColor: '#00FF00',
  lastGuestColor: { 1: '#FF0000', 2: '#00FF00' },
  profileColors: {}
}

const AMY = { id: 'amy', color: '#AA0000' }
const BOB = { id: 'bob', color: '#00BB00' }
const withPick = (id: string, color: string, profileColor: string): SeatColorsState<Seat> => ({ ...defaultState, profileColors: { [id]: { color, profileColor } } })

describe('createSeatColorsSlice', () => {
  it('namespaces all three action types under seatColors/<namespace>/', () => {
    const { actions } = createSeatColorsSlice<Seat>('loadout', defaultState)
    expect(actions.setLastCpuColor.type).toBe('seatColors/loadout/setLastCpuColor')
    expect(actions.setLastGuestColor.type).toBe('seatColors/loadout/setLastGuestColor')
    expect(actions.setProfileColor.type).toBe('seatColors/loadout/setProfileColor')
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

  describe('setProfileColor', () => {
    it("keeps a profile's pick by profile id, with the profile's own color it was made against", () => {
      const { actions, reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      const state = reducer(defaultState, actions.setProfileColor({ profile: AMY, color: '#123456' }))
      expect(state).toEqual({ ...defaultState, profileColors: { amy: { color: '#123456', profileColor: '#AA0000' } } })
    })

    it("keeps one pick per profile, so a seat switching profiles doesn't lose the other's", () => {
      const { actions, reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      const state = reducer(reducer(defaultState, actions.setProfileColor({ profile: AMY, color: '#111111' })), actions.setProfileColor({ profile: BOB, color: '#222222' }))
      expect(state.profileColors).toEqual({ amy: { color: '#111111', profileColor: '#AA0000' }, bob: { color: '#222222', profileColor: '#00BB00' } })
    })

    it("drops the pick when the profile's own color is picked, ignoring case", () => {
      const { actions, reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      const state = reducer(withPick('amy', '#123456', '#AA0000'), actions.setProfileColor({ profile: AMY, color: '#aa0000' }))
      expect(state.profileColors).toEqual({})
    })

    it('drops the pick for a null color', () => {
      const { actions, reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      const state = reducer(withPick('amy', '#123456', '#AA0000'), actions.setProfileColor({ profile: AMY, color: null }))
      expect(state.profileColors).toEqual({})
    })

    it('returns the same state when there is no pick to drop', () => {
      const { actions, reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      expect(reducer(defaultState, actions.setProfileColor({ profile: AMY, color: null }))).toBe(defaultState)
    })
  })

  describe("the profile roster's own actions", () => {
    it("drops a deleted profile's pick", () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      expect(reducer(withPick('amy', '#123456', '#AA0000'), profilesActions.remove('amy')).profileColors).toEqual({})
    })

    it('drops the pick when the profile gets a new color of its own, and keeps it through a rename', () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      const picked = withPick('amy', '#123456', '#AA0000')
      // ProfilesManager saves the whole { color, name, tag } patch, so an unchanged color comes along with a rename.
      expect(reducer(picked, profilesActions.update({ id: 'amy', patch: { name: 'Amelia', color: '#aa0000', tag: 'A' } }))).toBe(picked)
      expect(reducer(picked, profilesActions.update({ id: 'amy', patch: { color: '#0000CC' } })).profileColors).toEqual({})
    })

    it("drops a pick whose profile came back from the shared roster with another color, and leaves missing profiles' picks alone", () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      const picked: SeatColorsState<Seat> = { ...defaultState, profileColors: { amy: { color: '#111111', profileColor: '#AA0000' }, bob: { color: '#222222', profileColor: '#00BB00' }, gone: { color: '#333333', profileColor: '#444444' } } }
      const roster = [{ ...AMY, color: '#0000CC' }, BOB] as Profile[]
      expect(reducer(picked, profilesActions.setAll(roster)).profileColors).toEqual({ bob: { color: '#222222', profileColor: '#00BB00' }, gone: { color: '#333333', profileColor: '#444444' } })
    })

    it('returns the same state for a roster that changes no picked color', () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      const picked = withPick('amy', '#123456', '#AA0000')
      expect(reducer(picked, profilesActions.setAll([AMY, BOB] as Profile[]))).toBe(picked)
    })
  })

  describe('profileSeatColor', () => {
    it("is the profile's pick while the profile keeps the color it was picked against", () => {
      expect(profileSeatColor(AMY, { amy: { color: '#123456', profileColor: '#aa0000' } })).toBe('#123456')
    })

    it("is the profile's own color without a pick, or once its color has changed since", () => {
      expect(profileSeatColor(AMY, {})).toBe('#AA0000')
      expect(profileSeatColor({ ...AMY, color: '#0000CC' }, { amy: { color: '#123456', profileColor: '#AA0000' } })).toBe('#0000CC')
    })
  })

  describe('REHYDRATE', () => {
    it('backfills a field missing from a persisted blob that predates it, instead of leaving it undefined', () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      // A persisted blob from before `profileColors` existed: no such key at all, not even
      // `undefined` explicitly, the same shape a real old AsyncStorage blob has.
      const staleState = { lastCpuColor: '#123456', lastGuestColor: { 1: '#111111', 2: '#222222' } } as SeatColorsState<Seat>
      const action = { type: 'persist/REHYDRATE', payload: { seatColors: staleState } }

      const state = reducer(staleState, action)

      expect(state.profileColors).toEqual({})
      expect(state.lastCpuColor).toBe('#123456')
      expect(state.lastGuestColor).toEqual({ 1: '#111111', 2: '#222222' })
    })

    it('keeps every field from a persisted blob that already has the full shape', () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      const persisted: SeatColorsState<Seat> = { lastCpuColor: '#123456', lastGuestColor: { 1: '#111111', 2: '#222222' }, profileColors: { amy: { color: '#abcabc', profileColor: '#AA0000' } } }
      const action = { type: 'persist/REHYDRATE', payload: { seatColors: persisted } }

      const state = reducer(defaultState, action)

      expect(state).toEqual(persisted)
    })

    it('drops the per-seat profileOverride a store saved before profileColors still has', () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      const saved = { lastCpuColor: '#123456', lastGuestColor: { 1: '#111111', 2: '#222222' }, profileOverride: { 1: '#abcabc', 2: null } }
      const action = { type: 'persist/REHYDRATE', payload: { seatColors: saved } }

      expect(reducer(defaultState, action)).toEqual({ lastCpuColor: '#123456', lastGuestColor: { 1: '#111111', 2: '#222222' }, profileColors: {} })
    })

    it('falls back to defaultState when this slice has nothing in the persisted payload at all', () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState)
      const action = { type: 'persist/REHYDRATE', payload: { theme: { appearance: 'system' } } }

      expect(reducer(defaultState, action)).toEqual(defaultState)
    })

    it('reads the persisted payload under a custom mountKey when one is passed', () => {
      const { reducer } = createSeatColorsSlice<Seat>('loadout', defaultState, 'p1SeatColors')
      const persisted: SeatColorsState<Seat> = { lastCpuColor: '#654321', lastGuestColor: { 1: '#333333', 2: '#444444' }, profileColors: { bob: { color: '#999999', profileColor: '#00BB00' } } }
      const action = { type: 'persist/REHYDRATE', payload: { p1SeatColors: persisted, seatColors: defaultState } }

      expect(reducer(defaultState, action)).toEqual(persisted)
    })
  })
})
