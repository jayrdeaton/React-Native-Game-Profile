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
  persistence via `profiles`/`onCreate`/`onSave`/`onDelete`. `onCreate`/`onSave` both take a
  `ProfileEditPatch` (`{ name, color, tag }`) — exported from this package's own public API (it was
  a private, unexported interface inside `ProfilesManager.tsx` until `ProfilesScreen` below needed
  to reference it from its own props).
- **`ProfilesScreen`** — the routed-screen shell around `ProfilesManager`: the container `View`,
  theme-derived background/foreground, a back button, and the commit-pending-edit-before-navigate
  composition every app in the fleet used to hand-roll on its own around `ProfilesManager` (see
  "Routed screens: `ProfilesScreen`" below). Same `ProfileEditPatch`-shaped
  `profiles`/`defaultColor`/`onCreate`/`onSave`/`onDelete` as `ProfilesManager` itself, plus
  `onBack`. Owns its own `ProfilesManagerHandle` ref internally — there's no `ref` prop here, since
  nothing outside it needs one anymore.
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

### Routed screens: `ProfilesScreen`

`ProfilesScreen` is the routed-screen shell every app in the fleet was hand-rolling on its own
around `ProfilesManager`: a container `View`, theme-derived bg/fg, a `headerLeft` back button, and
the two-line `managerRef.current?.commitPendingEdit(); onBack()` composition every app's own
back-button handler used to write out by hand (see `ProfilesManager`'s own `commitPendingEdit` doc
above for why that flush matters on a router that doesn't genuinely unmount a popped screen). It
owns that ref itself — there's no `ref` prop on `ProfilesScreen`, since nothing outside it needs
one any more.

Same `profiles`/`defaultColor`/`onCreate`/`onSave`/`onDelete` props as `ProfilesManager` — still
`ProfileEditPatch`-shaped, still deliberately not widened to your own richer `CreateProfileInput`;
compose any extra required fields (a key/control scheme, whatever's specific to your game) in your
own closure at the call site, exactly as you already would calling `ProfilesManager` directly —
plus `onBack`. `fg`/`fgMuted`/`bg`/`cardBg`/`titleVariant`/`colorPreview` are all independently
optional and forward straight through to the internal `ProfilesManager` (`bg` is new here —
`ProfilesManager` itself has no `bg`, since it doesn't own a container `View` of its own).

A whole routed screen, wired to your own store, is usually this small:

```tsx
// app/profiles.tsx
import { defaultColors } from '@rific/auto-paper'
import { ProfilesScreen } from '@tastic/profile'
import { router } from 'expo-router'

import { useGameStats } from '@/hooks/useGameStats'
import { useProfiles } from '@/hooks/useProfiles'

export default function Profiles() {
  const { profiles, createProfile, updateProfile, deleteProfile } = useProfiles()
  // Only for wiring onDelete below — clears a deleted profile's own stats record so it doesn't
  // stick around as an orphan once the profile itself is gone.
  const { removeProfileStats } = useGameStats()

  return (
    <ProfilesScreen
      profiles={profiles}
      defaultColor={defaultColors[0].value}
      onCreate={(patch) => createProfile(patch)}
      onSave={(id, patch) => updateProfile(id, patch)}
      onDelete={(id) => {
        deleteProfile(id)
        removeProfileStats(id)
      }}
      onBack={() => router.back()}
    />
  )
}
```

`useProfiles`/`useGameStats` are your own app's hooks, not exports of this package — `profiles` is
whatever `Profile[]` (or your own extended shape) you already keep in Redux/context/state, and
`createProfile`/`updateProfile`/`deleteProfile` are however you already persist it. `onBack` can be
anything with no arguments — `router.back()`, a `safeBack()`-style helper that no-ops with no back
stack behind it, `navigation.goBack()` — `ProfilesScreen` only ever calls it after flushing any
in-progress inline edit first.

### Redux helpers for the shared roster

The cross-app-roster sketch above is a pattern every `@tastic` game was hand-rolling on its own
(a roster reducer, a per-profile extension table, the initial-load decision, a foreground-resync
listener, a per-seat selection reducer). These five pieces are that logic extracted into reusable,
Redux-shaped building blocks — plain TypeScript, no dependency on `redux`/`react-redux` themselves,
so a host app plugs the reducer(s) into whatever store it already has:

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
- **`createProfileSelectionSlice<TSeat>(namespace, defaultState)`** — a factory for the *other*
  per-seat piece of state: which profile id each seat currently has selected (parallel to
  `createProfileExtensionSlice` above, but keyed by seat instead of by profile id). Returns a
  `{ actions: { select, clearProfile }, reducer }` pair over a plain `Record<TSeat, string | null>`.
  Unlike `createProfileExtensionSlice`, the seat set can't be derived from `TSeat` alone (types
  don't exist at runtime), so callers pass their own `defaultState` — the same literal object (e.g.
  `{ 1: null, 2: null }`) every app already declares today. `select({ seat, profileId })` sets one
  seat's selection directly; `clearProfile(profileId)` walks every seat and nulls out any that
  currently points at that id — call it when a profile is deleted so no seat is left referencing a
  ghost id. Always local, like the guest/CPU/override colors below — never part of the shared
  App Group roster, since who's selected on *this* device is naturally per-app, per-device state.

## Per-seat color persistence

A loadout/lobby screen's color for a given seat is never just "the selected profile's saved
color" — a seat can be a guest (no profile selected), a CPU opponent, or a profile the player
manually recolored for a clash-swap without touching the profile itself. Every `@tastic` game
(AirHockey, BoxHockey, Pong, LightCycles, Snake) ends up needing the same three cooperating pieces
of state to cover all three cases. This is the established pattern every game should follow — it
was previously undocumented at the package level, which is exactly why two of the five apps
(AirHockey, Snake) didn't pick up the third piece below until after they'd already shipped without
it.

- **`lastGuestColor`** — a `Record<Seat, string>`: what a seat's color was the last time it was a
  guest (no profile selected). Written only when a guest seat's color changes; a profile-selected
  seat never reads or writes it.
- **`lastCpuColor`** — the same idea for the CPU slot, as a single remembered `string` rather than a
  per-seat record (a CPU opponent only ever occupies one fixed seat in every shipped game so far).
- **`profileOverride`** — a `Record<Seat, string | null>`: a manual recolor or clash-swap landing on
  a seat that currently has a profile selected. `null` means "no override — track the profile's own
  saved color live." Cleared only when that seat's own profile selection genuinely changes, never by
  merely leaving and returning to the screen.

None of these three are exports of this package today. `lastGuestColor`/`lastCpuColor` predate it
entirely, and `profileOverride` is still hand-rolled per app — typically alongside
`createProfileSelectionSlice`'s own selection state, in the same seat-scoped slice (see e.g.
BoxHockey's `src/redux/seatColorsSlice.ts`) or folded into the app's own `gameSlice.ts` when there's
no dedicated slice to put it in (see Snake's `src/redux/gameSlice.ts`). This section exists so a new
app's author reads the convention here first, rather than hand-rolling something that quietly can't
interop with the rest of the fleet.

The resolution order at a loadout/lobby screen, for one seat:

```ts
const color = profile
  ? (profileOverride[seat] ?? profile.color) // profile selected: override wins, else the profile's own color
  : isCpu
    ? lastCpuColor // CPU slot: its own remembered color
    : lastGuestColor[seat] // guest seat: that seat's own remembered color
```

`lastGuestColor`/`lastCpuColor` are only ever consulted when no profile is selected for that seat at
all — a profile-selected seat's guest/CPU memory is neither read nor overwritten while it's active,
so switching a seat back to "guest" later still recalls whatever guest color it had before a profile
was ever selected there.

## Install

```bash
npm install @tastic/profile
```

Published to the public npm registry via tag-based CI (OIDC trusted publishing — see
`npm run release:patch`/`:minor`/`:major`).

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
