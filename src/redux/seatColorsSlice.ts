import { Profile } from '../types'
import { ActionCreator, createActionCreator } from './createActionCreator'
import { profilesActions } from './profilesSlice'

// redux-persist's own REHYDRATE action-type constant, inlined as a literal rather than taking a
// dependency on the package itself - this factory otherwise has no opinion on whether the
// consuming app uses redux-persist at all, and the string itself is a long-stable part of
// redux-persist's own public contract (unchanged across every major version). See the reducer's
// own REHYDRATE case below for why this needs handling at all.
const REHYDRATE = 'persist/REHYDRATE'

export interface SetLastGuestColorPayload<TSeat> {
  color: string
  seat: TSeat
}

// A color picked for a profile in this game: it holds while the profile keeps the color it had
// when the pick was made (see profileSeatColor).
export interface ProfileColorPick {
  color: string
  profileColor: string
}

export interface SetProfileColorPayload {
  // The profile the pick is for, with its own color as it is now.
  profile: Pick<Profile, 'id' | 'color'>
  // The pick. Null, or the profile's own color, drops it, so the seat follows the profile's color
  // again.
  color: string | null
}

export interface SeatColorsActions<TSeat> {
  setLastCpuColor: ActionCreator<string>
  setLastGuestColor: ActionCreator<SetLastGuestColorPayload<TSeat>>
  setProfileColor: ActionCreator<SetProfileColorPayload>
}

export type SeatColorsState<TSeat extends string | number> = {
  lastCpuColor: string
  lastGuestColor: Record<TSeat, string>
  // Each profile's pick in this game, by profile id. A profile not listed shows its own color.
  profileColors: Record<string, ProfileColorPick>
}

export interface SeatColorsSlice<TSeat extends string | number> {
  actions: SeatColorsActions<TSeat>
  reducer: (state: SeatColorsState<TSeat> | undefined, action: { type: string; payload?: unknown }) => SeatColorsState<TSeat>
}

function sameColor(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase()
}

// The color a seat with `profile` selected shows: the profile's pick in this game, while the profile
// still has the color the pick was made against, else the profile's own color. So a new color for
// the profile itself (on any game's Profiles screen, this one or a sibling's through the shared
// roster) replaces an older pick, while a rename or a new tag keeps it.
export function profileSeatColor(profile: Pick<Profile, 'id' | 'color'>, profileColors: Record<string, ProfileColorPick>): string {
  const pick = profileColors[profile.id]
  return pick && sameColor(pick.profileColor, profile.color) ? pick.color : profile.color
}

// Which color a seat should show right now, remembered independently for three sources that must
// never fight over one value: a guest seat's own last pick, the CPU seat's own last pick, and each
// profile's own pick in this game (`profileColors`, by profile id, read through profileSeatColor).
// A profile's pick follows the profile, not the seat: it is kept when the seat switches to another
// profile and back, when the profile moves to the other seat, and across relaunches, the same as
// Solitaire's per-profile table color (2026-10-16; until then it was a per-seat `profileOverride`
// that any profile change on the seat cleared). Picking the profile's own color drops the pick, and
// so do a new color for the profile itself and deleting it (this package's profilesActions, which
// this reducer also listens to). Five @tastic games (AirHockey, BoxHockey,
// LightCycles, Pong, Snake) use this factory; the first four each hand-rolled an identical
// dedicated seatColorsSlice.ts before it existed.
//
// A store saved before profileColors existed has a `profileOverride` key instead; REHYDRATE drops
// it, so every profile starts on its own color once.
//
// `namespace` prefixes every action type (e.g. 'seatColors/loadout/setLastGuestColor') so an app
// with more than one independent seat-colors concern never collides between them - same convention
// createProfileSelectionSlice's and createProfileExtensionSlice's own namespace arguments follow.
//
// Unlike createProfileExtensionSlice, the seat set can't be derived from TSeat alone (types don't
// exist at runtime), so callers pass their own `defaultState` - same reasoning, and the same
// {1: ..., 2: ...}-shaped literal each app already declares as its own defaultSeatColorsState
// constant today, as createProfileSelectionSlice's own defaultState parameter.
//
// `mountKey` defaults to 'seatColors' - the literal key every current consumer (AirHockey,
// BoxHockey, Pong) already mounts this reducer under in its own combineReducers({...}) call (e.g.
// `combineReducers({ ..., seatColors })`). It has to be passed explicitly rather than inferred,
// since redux-persist's REHYDRATE payload is keyed by whatever name the app's own root reducer
// happens to use, which this factory has no way to see from inside its own reducer function - only
// worth overriding if some future consumer ever mounts this under a different key.
export function createSeatColorsSlice<TSeat extends string | number>(namespace: string, defaultState: SeatColorsState<TSeat>, mountKey = 'seatColors'): SeatColorsSlice<TSeat> {
  const setLastCpuColor = createActionCreator<string>(`seatColors/${namespace}/setLastCpuColor`)
  const setLastGuestColor = createActionCreator<SetLastGuestColorPayload<TSeat>>(`seatColors/${namespace}/setLastGuestColor`)
  const setProfileColor = createActionCreator<SetProfileColorPayload>(`seatColors/${namespace}/setProfileColor`)

  function withoutPick(state: SeatColorsState<TSeat>, id: string): SeatColorsState<TSeat> {
    if (!state.profileColors[id]) return state
    const profileColors = { ...state.profileColors }
    delete profileColors[id]
    return { ...state, profileColors }
  }

  function reducer(state: SeatColorsState<TSeat> = defaultState, action: { type: string; payload?: unknown }): SeatColorsState<TSeat> {
    // redux-persist's own default stateReconciler (autoMergeLevel1) HARD-REPLACES this slice's
    // entire persisted sub-state on rehydration rather than backfilling missing fields (confirmed
    // against autoMergeLevel1's actual source: `newState[key] = inboundState[key]`, not a merge) -
    // so a device with a blob persisted before a field existed would otherwise rehydrate without
    // it, and every consumer indexes into these fields with no fallback, throwing. Spreading
    // `defaultState` first, then the incoming persisted value, backfills exactly that gap. A
    // reducer that returns a new object here keeps autoMergeLevel1 from putting the saved blob back
    // over it, which is what lets the old `profileOverride` key be dropped.
    if (action.type === REHYDRATE) {
      const persisted = (action.payload as Record<string, Partial<SeatColorsState<TSeat>>> | undefined)?.[mountKey]
      const next: SeatColorsState<TSeat> & { profileOverride?: unknown } = { ...defaultState, ...state, ...persisted }
      delete next.profileOverride
      return next
    }
    if (setLastCpuColor.match(action)) return { ...state, lastCpuColor: action.payload }
    if (setLastGuestColor.match(action)) return { ...state, lastGuestColor: { ...state.lastGuestColor, [action.payload.seat]: action.payload.color } as Record<TSeat, string> }
    if (setProfileColor.match(action)) {
      const { profile, color } = action.payload
      if (color === null || sameColor(color, profile.color)) return withoutPick(state, profile.id)
      return { ...state, profileColors: { ...state.profileColors, [profile.id]: { color, profileColor: profile.color } } }
    }
    if (profilesActions.remove.match(action)) return withoutPick(state, action.payload)
    // A new color for the profile itself replaces its pick: this game's Profiles screen (update), or
    // a sibling's through the shared roster (setAll). A pick for a profile missing from the roster is
    // left alone, like the selection's own pruneToRoster leaves stats alone.
    if (profilesActions.update.match(action)) {
      const { id, patch } = action.payload
      const pick = state.profileColors[id]
      return pick && patch.color !== undefined && !sameColor(patch.color, pick.profileColor) ? withoutPick(state, id) : state
    }
    if (profilesActions.setAll.match(action)) {
      return action.payload.reduce((next, profile) => {
        const pick = next.profileColors[profile.id]
        return pick && !sameColor(profile.color, pick.profileColor) ? withoutPick(next, profile.id) : next
      }, state)
    }
    return state
  }

  return { actions: { setLastCpuColor, setLastGuestColor, setProfileColor }, reducer }
}
