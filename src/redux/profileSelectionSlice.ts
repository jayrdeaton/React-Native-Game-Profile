import { ActionCreator, createActionCreator } from './createActionCreator'

// redux-persist's own REHYDRATE action-type constant, inlined as a literal rather than taking a
// dependency on the package itself — this factory otherwise has no opinion on whether the
// consuming app uses redux-persist at all, and the string itself is a long-stable part of
// redux-persist's own public contract (unchanged across every major version). See the reducer's
// own REHYDRATE case below for why this needs handling at all.
const REHYDRATE = 'persist/REHYDRATE'

export interface SelectProfilePayload<TSeat> {
  profileId: string | null
  seat: TSeat
}

export interface ProfileSelectionActions<TSeat> {
  clearProfile: ActionCreator<string>
  select: ActionCreator<SelectProfilePayload<TSeat>>
}

export type ProfileSelectionState<TSeat extends string | number> = Record<TSeat, string | null>

export interface ProfileSelectionSlice<TSeat extends string | number> {
  actions: ProfileSelectionActions<TSeat>
  reducer: (state: ProfileSelectionState<TSeat> | undefined, action: { type: string; payload?: unknown }) => ProfileSelectionState<TSeat>
}

// Which profile each seat last picked — always local, never part of the shared App Group roster
// (this package's own profiles slice, see profilesSlice.ts): who's selected on THIS device is
// naturally a per-app, per-device thing, not something a sibling @tastic game should see or
// influence. Five @tastic games (AirHockey, BoxHockey, Pong, LightCycles, Snake) each hand-rolled
// an identical Record<Seat, string | null> reducer before this factory existed — same duplication
// createProfileExtensionSlice generalized away for per-profile extensions, this is that shape for
// per-seat selection instead.
//
// `namespace` prefixes every action type (e.g. 'profileSelection/loadout/select') so an app with
// more than one independent seat-selection concern never collides between them — same convention
// createProfileExtensionSlice's own namespace argument follows.
//
// Unlike createProfileExtensionSlice, the seat set can't be derived from TSeat alone (types don't
// exist at runtime), so callers pass their own `defaultState` — the same literal object (e.g.
// `{ 1: null, 2: null }`) each app already declares as its own `defaultProfileSelectionState`
// constant today. `clearProfile` walks that state's own keys rather than assuming any particular
// seat count, so it reproduces the 5 apps' current two-seat behavior without hardcoding "1"/"2".
//
// `mountKey` defaults to 'profileSelection' — the literal key every current consumer (AirHockey,
// BoxHockey, Pong, LightCycles, Snake) already mounts this reducer under in its own
// combineReducers({...}) call (e.g. `combineReducers({ ..., profileSelection })`). It has to be
// passed explicitly rather than inferred, since redux-persist's REHYDRATE payload is keyed by
// whatever name the app's own root reducer happens to use, which this factory has no way to see
// from inside its own reducer function — only worth overriding if some future consumer ever mounts
// this under a different key. Note `namespace` above is a different thing: it's the app's own name
// (e.g. 'airhockey', 'boxhockey'), used only to prefix action types, not the mount key.
export function createProfileSelectionSlice<TSeat extends string | number>(namespace: string, defaultState: ProfileSelectionState<TSeat>, mountKey = 'profileSelection'): ProfileSelectionSlice<TSeat> {
  const select = createActionCreator<SelectProfilePayload<TSeat>>(`profileSelection/${namespace}/select`)
  const clearProfile = createActionCreator<string>(`profileSelection/${namespace}/clearProfile`)

  function reducer(state: ProfileSelectionState<TSeat> = defaultState, action: { type: string; payload?: unknown }): ProfileSelectionState<TSeat> {
    // redux-persist's own default stateReconciler (autoMergeLevel1) HARD-REPLACES this slice's
    // entire persisted sub-state on rehydration rather than backfilling missing fields (confirmed
    // against autoMergeLevel1's actual source: `newState[key] = inboundState[key]`, not a merge) —
    // so a device with a blob persisted before a new seat existed would otherwise rehydrate with
    // that seat's key missing entirely, and every consumer indexes into it (`state[seat]`) with no
    // fallback. Spreading `defaultState` first, then the incoming persisted value, backfills exactly
    // that gap — the same pattern createSeatColorsSlice's own REHYDRATE case already uses.
    if (action.type === REHYDRATE) {
      const persisted = (action.payload as Record<string, Partial<ProfileSelectionState<TSeat>>> | undefined)?.[mountKey]
      return { ...defaultState, ...state, ...persisted }
    }
    if (select.match(action)) return { ...state, [action.payload.seat]: action.payload.profileId } as ProfileSelectionState<TSeat>
    if (clearProfile.match(action)) {
      const next = { ...state }
      for (const seat of Object.keys(state) as TSeat[]) {
        if (next[seat] === action.payload) next[seat] = null
      }
      return next
    }
    return state
  }

  return { actions: { clearProfile, select }, reducer }
}
