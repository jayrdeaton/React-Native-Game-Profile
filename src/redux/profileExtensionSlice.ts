import { ActionCreator, createActionCreator } from './createActionCreator'

export interface SetProfileExtensionPayload<TExtension> {
  extension: TExtension
  id: string
}

export interface ProfileExtensionActions<TExtension> {
  remove: ActionCreator<string>
  set: ActionCreator<SetProfileExtensionPayload<TExtension>>
}

export type ProfileExtensionState<TExtension> = Record<string, TExtension>

export interface ProfileExtensionSlice<TExtension> {
  actions: ProfileExtensionActions<TExtension>
  reducer: (state: ProfileExtensionState<TExtension> | undefined, action: { type: string }) => ProfileExtensionState<TExtension>
}

// A per-profile extension is any app-specific field that doesn't belong on the shared base Profile
// type (a control scheme, a key-binding preference, a difficulty setting, ...) but still needs to
// travel WITH a specific profile id, entirely locally — never synced to the shared App Group
// roster (a profile created on a sibling @tastic game has no idea this extension exists at all,
// same as this package's own README describes for any app-specific field). Two real @tastic games
// (BoxHockey's controlScheme, LightCycles' keyScheme) each hand-rolled an almost-identical
// Record<profileId, TExtension> reducer before this factory existed; this is that shape,
// generalized over the extension's own type so a future game's own per-profile preference doesn't
// need a third copy.
//
// `namespace` prefixes every action type (e.g. 'profileExtension/controlScheme/set') so an app with
// more than one independent per-profile extension never collides between them — same convention
// @rific/core's createSettingsSlice uses its own namespace argument for.
//
// Deliberately NOT auto-cleared when the base `profiles` slice removes an id — this stays a plain,
// self-contained reducer rather than importing profilesActions.remove's action type to listen for.
// An app already dispatches multiple independent actions when deleting a profile (profilesActions.
// remove, and typically its own local selection-slice cleanup); calling this slice's own `remove`
// alongside those is one more such dispatch, not new cross-slice wiring.
export function createProfileExtensionSlice<TExtension>(namespace: string): ProfileExtensionSlice<TExtension> {
  const set = createActionCreator<SetProfileExtensionPayload<TExtension>>(`profileExtension/${namespace}/set`)
  const remove = createActionCreator<string>(`profileExtension/${namespace}/remove`)

  function reducer(state: ProfileExtensionState<TExtension> = {}, action: { type: string }): ProfileExtensionState<TExtension> {
    if (set.match(action)) return { ...state, [action.payload.id]: action.payload.extension }
    if (remove.match(action)) {
      if (!(action.payload in state)) return state
      const next = { ...state }
      delete next[action.payload]
      return next
    }
    return state
  }

  return { actions: { remove, set }, reducer }
}
