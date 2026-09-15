# @tastic/profile

Player profile identity for local-multiplayer React Native games — a saved name/color/tag a player
selects per seat, with a selection popover, an inline-editable roster screen, and a reusable identity
badge. Deliberately blind to anything app-specific: a control scheme, a stats bucket, or anything
else keyed by profile id lives entirely on the host app's own side.

## Why a separate `Profile` type at all?

Every app built on this package needs its own extra fields on a profile — a key/gesture scheme, a
push/pull control mode, whatever's specific to that game. Baking any of those into this package's
own `Profile` type would mean every OTHER app carries fields it doesn't use. Instead, this package's
`Profile` is deliberately minimal:

```ts
interface Profile {
  id: string
  name: string
  color: string
  tag: string
  createdAt: number
  updatedAt: number
}
```

A host app extends this on its own (`interface Profile extends BaseProfile { keyScheme: KeyScheme }`)
and structural typing carries the richer shape straight through every component here that only ever
reads the base fields — no wrapper or adapter needed. The one place this needs a little more than
plain structural typing is `ProfilePicker`'s `onSelect` callback, which hands a profile back *out* —
see its own doc comment for why that component is generic over your own `Profile` type.

## What's in here

- **`Profile`** — the base identity type described above.
- **`isValidProfile` / `isValidTag`** — hand-rolled validators (no RN import, so they stay usable in
  plain-Node contexts like Jest without touching `react-native-paper`/`@rific/auto-paper`'s own
  RN-touching barrels). `isValidTag` accepts up to `MAX_TAG_LENGTH` plain characters or exactly one
  emoji (including a ZWJ-joined compound), and rejects mixing the two. `isValidProfile` checks only
  this package's own base fields — a host app composes its own richer validator on top the same way
  it extends the type:
  ```ts
  function isValidProfile(v: unknown): v is Profile {
    return isValidBaseProfile(v) && isValidKeyScheme((v as Partial<Profile>).keyScheme)
  }
  ```
- **`ProfileChip`** — a profile's identity at a glance: its own color as a filled circle, with its
  tag (or a generic fallback icon, if empty) in a contrast-safe color on top. `filled={false}` drops
  the background fill for a selected-row context that already fills its own background.
- **`ProfilePicker`** — a name trigger + selection popover: pick an existing profile, fall back to a
  null/"guest" selection, or (if `onManage` is passed) navigate to a management screen. Selection
  only — creating, renaming, and deleting all live in `ProfilesManager`. Generic over your own
  `Profile` type (see above).
- **`ProfilesManager`** — the roster screen itself: create/rename/recolor/retag/delete, editing
  inline in the row you tap, with a destructive-delete confirmation. No navigation of its own (no
  router, no back button) — a host app renders this as a routed screen's body and supplies its own
  persistence via `profiles`/`onCreate`/`onSave`/`onDelete`.
- **`loadSharedProfiles` / `saveSharedProfiles` / `isSharedProfileStoreAvailable`** — an *optional*
  cross-app roster, shared between multiple apps of yours via a native iOS App Group (same Apple
  Developer Team, same `"com.apple.security.application-groups"` entitlement value on every
  participating app). This only ever carries the base `Profile` shape above — a host app's own
  extension fields (a key scheme, a control scheme, anything else) are NOT part of it and have to
  keep living in that app's own *local* storage, keyed by profile id, merged onto the shared base
  roster at read time (falling back to some per-app default whenever a shared profile's id isn't
  in that app's own local extension table yet — e.g. it was created on a different app in the
  group). This split is deliberate, not a limitation to work around: it's this package's own
  base-fields-only `Profile` boundary (see above), just applied to storage instead of just to the
  TypeScript type.

  ```ts
  // Conceptual sketch of the pattern — see "Redux helpers for the shared roster" below for a
  // ready-made version of it.
  const GROUP_ID = 'group.com.yourteam.yourgames'
  const base = isSharedProfileStoreAvailable ? await loadSharedProfiles(GROUP_ID) : localBaseFallback
  const profiles = base.map((p) => ({ ...p, controlScheme: localExtensions[p.id]?.controlScheme ?? DEFAULT_CONTROL_SCHEME }))
  // ...on create/update/delete, write the base fields back with saveSharedProfiles(GROUP_ID, nextBase)
  // and the extension field to the app's own local storage, same as today.
  ```

  Backed by a small native Expo Module (`ios/TasticProfileModule.swift`) wrapping
  `UserDefaults(suiteName:)` — iOS only (see `expo-module.config.json`'s `"apple"`-only platform
  list); `isSharedProfileStoreAvailable` is `false` on Android/web and on any iOS build that hasn't
  run `expo prebuild` since adding this App Group's entitlement, so a host app always needs its own
  local-storage fallback path regardless of platform. Requires the App Group itself to be declared
  in each consuming app's own Expo config, e.g.:

  ```json
  // app.json
  { "expo": { "ios": { "entitlements": { "com.apple.security.application-groups": ["group.com.yourteam.yourgames"] } } } }
  ```

### Redux helpers for the shared roster

The cross-app-roster sketch above is a pattern every `@tastic` game was hand-rolling on its own
(a roster reducer, a per-profile extension table, the initial-load decision, a foreground-resync
listener). These four pieces are that logic extracted into reusable, Redux-shaped building blocks —
plain TypeScript, no dependency on `redux`/`react-redux` themselves, so a host app plugs the
reducer(s) into whatever store it already has:

- **`profilesActions` / `profilesReducer` / `createProfileRecord`** — the base roster as a reducer:
  `add`/`update`/`remove`/`setAll` actions, plus `createProfileRecord(input)` to mint a complete
  `Profile` (id + timestamps) ready to dispatch via `profilesActions.add`.
- **`createProfileExtensionSlice<TExtension>(namespace)`** — a factory for a host app's own
  per-profile extension fields (a control scheme, a key scheme, ...): returns a
  `{ actions: { set, remove }, reducer }` pair over a plain `Record<profileId, TExtension>`,
  namespaced so more than one extension slice in the same app never collides. Not auto-cleared when
  `profilesReducer` removes a profile — an app already dispatches its own cleanup action(s) on
  delete, so this stays a self-contained reducer rather than new cross-slice wiring.
- **`resolveInitialProfiles(groupId, localFallback)`** — the one-time initial-load decision: shared
  store unavailable → `localFallback` verbatim; shared store empty → seed it from `localFallback`;
  otherwise the shared roster always wins over a possibly-stale local snapshot.
- **`useSharedProfilesSync({ groupId, onRemoteChange })`** — keeps a Redux-backed roster in sync for
  the rest of the app's lifetime: call the returned `syncToShared(next)` right after a local roster
  change to mirror it out, and `onRemoteChange` fires with a freshly-loaded roster whenever the app
  returns to the foreground (skipped while a `syncToShared` write is still in flight, so a remote
  refresh can't clobber a write that hasn't landed yet).

## Install

```bash
npm install @tastic/profile
```

Published to the public npm registry via tag-based CI (OIDC trusted publishing — see
`npm run release:patch`/`:minor`/`:major`); no local linking needed for normal use.

To develop against a local change before it's published, use `yalc` instead:

```bash
cd react-native-game-profile
npm run build
yalc publish

cd ../your-game
yalc add @tastic/profile
npm install
```

Re-run `npm run build && yalc push` from this package after any change to propagate it to every
linked consumer at once.

## Peer dependencies

`react`, `react-native`, `react-native-paper`, `react-native-safe-area-context`, `@rific/auto-paper`
(`getContrastColor`, `useAutoPaperTheme`), `@rific/feedback-press` (`TouchableRipple`),
`@rific/focus-chain` (`useFocusChain`), `@rific/toaster` (`useToast`), `@tastic/hud`
(`InlineColorPicker`, `PopoverBody`, `PopoverHost`, `useAutoAlign`, `usePopoverHost`), `@tastic/core`
(a peer of `@tastic/hud` itself) — none of these are bundled, so use whatever versions your app
already has.

`expo-modules-core` is an *optional* peer — only resolved by `loadSharedProfiles`/`saveSharedProfiles`
for the native App Group bridge described above; safe to omit entirely on an Android/web-only
consumer.
