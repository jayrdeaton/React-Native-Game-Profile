import { createProfileExtensionSlice } from '../redux/profileExtensionSlice'

interface ControlSchemeExtension {
  controlScheme: 'flick' | 'tilt'
}

describe('createProfileExtensionSlice', () => {
  it('namespaces both action types under profileExtension/<namespace>/', () => {
    const { actions } = createProfileExtensionSlice<ControlSchemeExtension>('controlScheme')
    expect(actions.set.type).toBe('profileExtension/controlScheme/set')
    expect(actions.remove.type).toBe('profileExtension/controlScheme/remove')
  })

  it('two slices with different namespaces produce non-colliding action types', () => {
    const a = createProfileExtensionSlice<ControlSchemeExtension>('controlScheme')
    const b = createProfileExtensionSlice<{ keyScheme: 'wasd' | 'ijkl' }>('keyScheme')
    expect(a.actions.set.type).not.toBe(b.actions.set.type)
    expect(a.actions.set.match(b.actions.set({ extension: { keyScheme: 'wasd' }, id: 'x' }))).toBe(false)
  })

  it('defaults to an empty object when state is undefined', () => {
    const { reducer } = createProfileExtensionSlice<ControlSchemeExtension>('controlScheme')
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({})
  })

  it('returns the existing state unchanged for an unrelated action', () => {
    const { reducer } = createProfileExtensionSlice<ControlSchemeExtension>('controlScheme')
    const state = { 'profile-1': { controlScheme: 'flick' as const } }
    expect(reducer(state, { type: 'unrelated/action' })).toBe(state)
  })

  it('set adds a new entry keyed by profile id', () => {
    const { actions, reducer } = createProfileExtensionSlice<ControlSchemeExtension>('controlScheme')
    const state = reducer({}, actions.set({ extension: { controlScheme: 'flick' }, id: 'profile-1' }))
    expect(state).toEqual({ 'profile-1': { controlScheme: 'flick' } })
  })

  it('set overwrites an existing entry for the same id without touching others', () => {
    const { actions, reducer } = createProfileExtensionSlice<ControlSchemeExtension>('controlScheme')
    const initial = { 'profile-1': { controlScheme: 'flick' as const }, 'profile-2': { controlScheme: 'tilt' as const } }
    const state = reducer(initial, actions.set({ extension: { controlScheme: 'tilt' }, id: 'profile-1' }))
    expect(state).toEqual({ 'profile-1': { controlScheme: 'tilt' }, 'profile-2': { controlScheme: 'tilt' } })
  })

  it('remove deletes only the matching entry', () => {
    const { actions, reducer } = createProfileExtensionSlice<ControlSchemeExtension>('controlScheme')
    const initial = { 'profile-1': { controlScheme: 'flick' as const }, 'profile-2': { controlScheme: 'tilt' as const } }
    const state = reducer(initial, actions.remove('profile-1'))
    expect(state).toEqual({ 'profile-2': { controlScheme: 'tilt' } })
  })

  it('remove is a no-op (same reference) when the id has no entry', () => {
    const { actions, reducer } = createProfileExtensionSlice<ControlSchemeExtension>('controlScheme')
    const state = { 'profile-1': { controlScheme: 'flick' as const } }
    expect(reducer(state, actions.remove('missing'))).toBe(state)
  })
})
