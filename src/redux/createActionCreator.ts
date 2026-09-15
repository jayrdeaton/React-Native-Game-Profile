export interface ReduxAction<P> {
  payload: P
  type: string
}

export type ActionCreator<P> = ((payload: P) => ReduxAction<P>) & {
  type: string
  match: (action: { type: string }) => action is ReduxAction<P>
}

// Same low-level shape @rific/core's createSettingsSlice gives every other slice in the fleet
// (namespaced type string, .type, .match). Shared internally between profilesSlice.ts and
// profileExtensionSlice.ts rather than each hand-rolling its own copy — not exported from
// index.ts, since it's an implementation detail of how this package's own reducers are built, not
// something a consuming app needs.
export function createActionCreator<P>(type: string): ActionCreator<P> {
  const creator = ((payload: P) => ({ payload, type })) as ActionCreator<P>
  creator.type = type
  creator.match = (action: { type: string }): action is ReduxAction<P> => action.type === type
  return creator
}
