import { ActionCreator, createActionCreator } from './createActionCreator'

// redux-persist's own REHYDRATE action-type constant, inlined as a literal rather than taking a
// dependency on the package itself — this factory otherwise has no opinion on whether the
// consuming app uses redux-persist at all, and the string itself is a long-stable part of
// redux-persist's own public contract (unchanged across every major version). See the reducer's
// own REHYDRATE case below for why this needs handling at all.
const REHYDRATE = 'persist/REHYDRATE'

export interface SetLastGuestColorPayload<TSeat> {
  color: string
  seat: TSeat
}

export interface SetProfileOverridePayload<TSeat> {
  color: string | null
  seat: TSeat
}

export interface SeatColorsActions<TSeat> {
  setLastCpuColor: ActionCreator<string>
  setLastGuestColor: ActionCreator<SetLastGuestColorPayload<TSeat>>
  setProfileOverride: ActionCreator<SetProfileOverridePayload<TSeat>>
}

export type SeatColorsState<TSeat extends string | number> = {
  lastCpuColor: string
  lastGuestColor: Record<TSeat, string>
  profileOverride: Record<TSeat, string | null>
}

export interface SeatColorsSlice<TSeat extends string | number> {
  actions: SeatColorsActions<TSeat>
  reducer: (state: SeatColorsState<TSeat> | undefined, action: { type: string; payload?: unknown }) => SeatColorsState<TSeat>
}

// Which color a seat should show right now, remembered independently for three sources that must
// never fight over one value: a guest seat's own last pick, the CPU seat's own last pick, and a
// manual recolor/clash-swap override landing on a seat that currently has a profile selected (null
// meaning "no override, track that profile's own saved color live"). Four @tastic games (AirHockey,
// BoxHockey, LightCycles, Pong) each hand-rolled an identical dedicated seatColorsSlice.ts — same
// three fields, same createSlice-based reducer, differing only in their own seat type's name
// (Player) and default-color constants — before this factory existed; this is that shape,
// generalized over the seat type exactly like createProfileSelectionSlice generalized per-seat
// profile selection.
//
// Snake has the same three fields too, but folded directly into its own catch-all gameSlice.ts
// alongside a dozen unrelated persisted settings (wrapEdges, cpuDifficulty, speedTier, ...) rather
// than in a standalone slice of their own. There's no separate `seatColors` sub-state there for this
// factory's reducer to own without restructuring gameSlice's top-level shape to nest these three
// fields under their own key first — a real state-shape migration (and a redux-persist rehydration
// concern, see gameSlice's own REHYDRATE extraReducer), not a drop-in swap. This factory
// intentionally targets the standalone-slice shape the other four apps already have; Snake staying
// hand-rolled inside gameSlice is a deliberate scope call for this pass, not an oversight.
//
// `namespace` prefixes every action type (e.g. 'seatColors/loadout/setLastGuestColor') so an app
// with more than one independent seat-colors concern never collides between them — same convention
// createProfileSelectionSlice's and createProfileExtensionSlice's own namespace arguments follow.
//
// Unlike createProfileExtensionSlice, the seat set can't be derived from TSeat alone (types don't
// exist at runtime), so callers pass their own `defaultState` — same reasoning, and the same
// {1: ..., 2: ...}-shaped literal each app already declares as its own defaultSeatColorsState
// constant today, as createProfileSelectionSlice's own defaultState parameter.
//
// `mountKey` defaults to 'seatColors' — the literal key every current consumer (AirHockey,
// BoxHockey, Pong) already mounts this reducer under in its own combineReducers({...}) call (e.g.
// `combineReducers({ ..., seatColors })`). It has to be passed explicitly rather than inferred,
// since redux-persist's REHYDRATE payload is keyed by whatever name the app's own root reducer
// happens to use, which this factory has no way to see from inside its own reducer function — only
// worth overriding if some future consumer ever mounts this under a different key.
export function createSeatColorsSlice<TSeat extends string | number>(namespace: string, defaultState: SeatColorsState<TSeat>, mountKey = 'seatColors'): SeatColorsSlice<TSeat> {
  const setLastCpuColor = createActionCreator<string>(`seatColors/${namespace}/setLastCpuColor`)
  const setLastGuestColor = createActionCreator<SetLastGuestColorPayload<TSeat>>(`seatColors/${namespace}/setLastGuestColor`)
  const setProfileOverride = createActionCreator<SetProfileOverridePayload<TSeat>>(`seatColors/${namespace}/setProfileOverride`)

  function reducer(state: SeatColorsState<TSeat> = defaultState, action: { type: string; payload?: unknown }): SeatColorsState<TSeat> {
    // redux-persist's own default stateReconciler (autoMergeLevel1) HARD-REPLACES this slice's
    // entire persisted sub-state on rehydration rather than backfilling missing fields (confirmed
    // against autoMergeLevel1's actual source: `newState[key] = inboundState[key]`, not a merge) —
    // so a device with a blob persisted before `profileOverride` existed would otherwise rehydrate
    // with `state.profileOverride === undefined`, and every consumer indexes into it (`profileOverride[seat]`)
    // with no fallback, throwing. Spreading `defaultState` first, then the incoming persisted
    // value, backfills exactly that gap — the same pattern Snake's own hand-rolled `gameSlice.ts`
    // already uses for its equivalent (non-factory) fields via its own REHYDRATE extraReducer.
    if (action.type === REHYDRATE) {
      const persisted = (action.payload as Record<string, Partial<SeatColorsState<TSeat>>> | undefined)?.[mountKey]
      return { ...defaultState, ...state, ...persisted }
    }
    if (setLastCpuColor.match(action)) return { ...state, lastCpuColor: action.payload }
    if (setLastGuestColor.match(action)) return { ...state, lastGuestColor: { ...state.lastGuestColor, [action.payload.seat]: action.payload.color } as Record<TSeat, string> }
    if (setProfileOverride.match(action)) return { ...state, profileOverride: { ...state.profileOverride, [action.payload.seat]: action.payload.color } as Record<TSeat, string | null> }
    return state
  }

  return { actions: { setLastCpuColor, setLastGuestColor, setProfileOverride }, reducer }
}
