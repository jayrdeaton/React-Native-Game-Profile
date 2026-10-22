# @tastic/profile

Player profile identity for local-multiplayer React Native games - a saved name/color/tag a player
selects per seat, with a selection popover, an inline-editable roster screen, and a reusable identity
badge. Deliberately blind to anything app-specific: a control scheme, a stats bucket, or anything
else keyed by profile id lives entirely on the host app's own side.

## Why a separate `Profile` type at all?

Every app built on this package needs its own extra fields on a profile - a key/gesture scheme, a
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
reads the base fields - no wrapper or adapter needed. The one place this needs a little more than
plain structural typing is `ProfilePicker`'s `onSelect` callback, which hands a profile back *out* -
see its own doc comment for why that component is generic over your own `Profile` type.

## What's in here

- **`Profile`**: the base identity type described above.
- **`isValidProfile` / `isValidTag`**: hand-rolled validators (no RN import, so they stay usable in
  plain-Node contexts like Jest without touching `react-native-paper`/`@rific/auto-paper`'s own
  RN-touching barrels). `isValidTag` accepts up to `MAX_TAG_LENGTH` plain characters or exactly one
  emoji (including a ZWJ-joined compound), and rejects mixing the two. `isValidProfile` checks only
  this package's own base fields - a host app composes its own richer validator on top the same way
  it extends the type:
  ```ts
  function isValidProfile(v: unknown): v is Profile {
    return isValidBaseProfile(v) && isValidKeyScheme((v as Partial<Profile>).keyScheme)
  }
  ```
- **`ProfileChip`**: a profile's identity at a glance: its own color as a filled circle, with its
  tag (or a generic fallback icon, if empty) in a contrast-safe color on top. `filled={false}` drops
  the background fill for a selected-row context that already fills its own background.
- **`ProfilePicker`**: a name trigger + selection popover: pick an existing profile, fall back to a
  null/"guest" selection, or (if `onManage` is passed) navigate to a management screen. Selection
  only - creating, renaming, and deleting all live in `ProfilesManager`. Generic over your own
  `Profile` type (see above). `takenId` disables one other seat's profile in the list; `takenIds`
  (an array) disables several, for a lobby with more than two seats, and never disables the
  picker's own selection, so you can pass every seated id. Placement props (all optional, see "Fake-rotated frames" below):
  `align` (force a horizontal side), `alignOverride` (substitute the whole placement result), and
  `rotation` (forwarded to the automatic measurement). `colorSection`
  (`{ value, onChange, previewValue?, swatches?, label?, caption? }`) puts a Color row at the top of
  the popover that opens a page of swatches (with a back row), and turns the trigger into one
  button that leads with a chip in `color` with the selected profile's tag; `triggerStyle` styles
  that button. A `flexShrink` in `triggerStyle` lets the button give way in a row too narrow for
  it: its label is cut off with an ellipsis while the chip and chevron keep their size, and it never
  gets narrower than those. With room it lays out as before. `OptionPicker` takes the same
  `triggerStyle`. Also exports
  `getProfilePickerContentSize(profileCount, hasManageRow?, colorSection?)` - the popover's
  `{ width, height }`, for sizing your own placement hook.
- **`ProfilesManager`**: the roster screen itself: create/rename/recolor/retag/delete, editing
  inline in the row you tap, with a destructive-delete confirmation. No navigation of its own (no
  router, no back button) - a host app renders this as a routed screen's body and supplies its own
  persistence via `profiles`/`onCreate`/`onSave`/`onDelete`. `onCreate`/`onSave` both take a
  `ProfileEditPatch` (`{ name, color, tag }`) - exported from this package's own public API (it was
  a private, unexported interface inside `ProfilesManager.tsx` until `ProfilesScreen` below needed
  to reference it from its own props).
- **`ProfilesScreen`**: the routed-screen shell around `ProfilesManager`: the container `View`,
  theme-derived background/foreground, a back button, and the commit-pending-edit-before-navigate
  composition every app in the fleet used to hand-roll on its own around `ProfilesManager` (see
  "Routed screens: `ProfilesScreen`" below). Same `ProfileEditPatch`-shaped
  `profiles`/`defaultColor`/`onCreate`/`onSave`/`onDelete` as `ProfilesManager` itself, plus
  `onBack`. Owns its own `ProfilesManagerHandle` ref internally - there's no `ref` prop here, since
  nothing outside it needs one anymore.
- **`readSharedProfiles` / `loadSharedProfiles` / `saveSharedProfiles` / `subscribeSharedProfiles` / `isSharedProfileStoreAvailable`**: an *optional*
  cross-app roster, shared between multiple apps of yours via a native iOS App Group (same Apple
  Developer Team, same `"com.apple.security.application-groups"` entitlement value on every
  participating app). This only ever carries the base `Profile` shape above - a host app's own
  extension fields (a key scheme, a control scheme, anything else) are NOT part of it and have to
  keep living in that app's own *local* storage, keyed by profile id, merged onto the shared base
  roster at read time (falling back to some per-app default whenever a shared profile's id isn't
  in that app's own local extension table yet - e.g. it was created on a different app in the
  group). This split is deliberate, not a limitation to work around: it's this package's own
  base-fields-only `Profile` boundary (see above), just applied to storage instead of just to the
  TypeScript type. A read drops any stored entry that this version's `isValidProfile` rejects (a
  profile saved by a newer app under a rule loosened since), and `saveSharedProfiles` writes those
  entries back after your roster as they were, so an older app can't delete a newer app's profile
  just by saving.

  ```ts
  // Conceptual sketch of the pattern - see "Redux helpers for the shared roster" below for a
  // ready-made version of it.
  const GROUP_ID = 'group.com.yourteam.yourgames'
  // null is a failed read, not an empty roster: keep the local copy and write nothing back.
  const base = (isSharedProfileStoreAvailable ? await readSharedProfiles(GROUP_ID) : null) ?? localBaseFallback
  const profiles = base.map((p) => ({ ...p, controlScheme: localExtensions[p.id]?.controlScheme ?? DEFAULT_CONTROL_SCHEME }))
  // ...on create/update/delete, write the base fields back with saveSharedProfiles(GROUP_ID, nextBase)
  // and the extension field to the app's own local storage, same as today.
  ```

  `readSharedProfiles` resolves to `[]` when nothing has been shared yet and to `null` when the
  roster is there but couldn't be read (the native call failed, the blob is corrupt, or every entry
  in it is invalid). Never treat that `null` as an empty roster: an app that replaces its roster
  with `[]` and then saves deletes every profile from the shared store, for every app in the group.
  `loadSharedProfiles` is the older form that flattens a failed read to `[]`; use it only where the
  result can't replace a roster or lead to a write.

  Backed by a small native Expo Module (`ios/TasticProfileModule.swift`) wrapping
  `UserDefaults(suiteName:)` on iOS (see `expo-module.config.json`'s `"apple"`-only platform list),
  and on the web by `localStorage`, under the key `<groupId>:sharedProfiles`: games served from one
  origin (for example `games.example.com/<game>/`) share it the way apps share an App Group, while
  games on different origins can't see each other's. The web store writes and removes a probe key
  once at load and stays unavailable if that fails (storage blocked), and after a write that fails
  anyway, reads fail until a write succeeds, so an older roster can't undo a local change.
  `subscribeSharedProfiles(groupId, listener)` hands `listener` the roster another tab or game on
  the same origin has just saved (the browser's `storage` event); it does nothing on native.
  `useSharedProfilesSync` subscribes for you. `isSharedProfileStoreAvailable` is `false` on
  Android, on a web page that can't write `localStorage`, and on any iOS build that hasn't run
  `expo prebuild` since adding this App Group's entitlement, so a host app always needs its own
  local-storage fallback path regardless of platform. Requires the App Group itself to be declared
  in each consuming app's own Expo config, e.g.:

  ```json
  // app.json
  { "expo": { "ios": { "entitlements": { "com.apple.security.application-groups": ["group.com.yourteam.yourgames"] } } } }
  ```

### Fake-rotated frames: `ProfilePicker` placement

`ProfilePicker` positions its popover with `@tastic/hud`'s `useAutoAlign`, which measures the
trigger with `measureInWindow` and compares that rect against the raw window. Inside a *fake*
rotation (a `View` turned +-90deg while the OS stays portrait-locked) the rect is in true screen
space but the frame is not, so the hook measures along the wrong axes and can pick the wrong side -
flipping the list upward off-screen, or running it past the frame's bottom. Two optional props give
you the same seam `@tastic/hud`'s `InlineColorPicker` has:

| Prop | Type | Default | Effect |
| --- | --- | --- | --- |
| `align` | `'left' \| 'right' \| 'center'` | - | Forces the horizontal side; always beats the placement's own `align`. |
| `alignOverride` | `ProfilePickerAlignResult` (`{ align, verticalAlign, maxHeight, measured, triggerRef }`, the same shape as `useAutoAlign`'s return / `@tastic/hud`'s `AlignResult`) | - | Replaces the automatic placement wholesale: its `align`/`verticalAlign`/`maxHeight`/`measured` drive the popover, and its `triggerRef` is the ref attached to the measured trigger. |
| `rotation` | `0 \| 90 \| -90 \| 180` | `0` | Forwarded to the automatic `useAutoAlign` call (needs `@tastic/hud` >= 0.8.0). Ignored when `alignOverride` is given. |

With none of them set the picker behaves exactly as it always has. Note `rotation` is never read
from an ambient provider here (unlike `@tastic/hud`'s own pickers) - this package doesn't touch
`@tastic/core` at runtime - so pass it explicitly.

To supply your own placement, run a rotation-aware placement hook against the popover's real size,
using `getProfilePickerContentSize` so the two can't drift:

```tsx
const open = host.openId === `${idPrefix}-profile`
const { width, height } = getProfilePickerContentSize(profiles.length, !!onManage)
const placement = useMyRotatedAlign(open, width, height) // returns a ProfilePickerAlignResult

<ProfilePicker idPrefix={idPrefix} host={host} profiles={profiles} /* ... */ alignOverride={placement} />
```

`getProfilePickerContentSize(profileCount, hasManageRow = false)` returns `{ width, height }`: 220
wide, and `8 * 2 + (profileCount + 1 + (hasManageRow ? 1 : 0)) * 36` tall (the null/"guest" row, one
row per profile, and the Manage row when `onManage` is passed), or with a color section (pass the same
object the picker gets) the taller of its two pages: that list plus the Color row (48 with a
caption, 36 without) and its 9pt divider, or the color page (a 36pt back row and the swatches, 187
for 20 colors), plus the padding.


#### The Profiles screen's color swatch: `useColorPickerAlign`

`ProfilesManager` (and `ProfilesScreen`, which forwards it) renders `@tastic/hud`'s `InlineColorPicker`
for the swatch popover in an edit row, and owns the popover state internally - so the host cannot pass
`alignOverride` to it directly. Inside a fake-rotated frame that popover has the same misplacement (and
`InlineColorPicker` also feeds `useAutoAlign` its ambient rotation, double-rotating an already-transformed
rect). Pass a placement **hook** as `useColorPickerAlign`:

```tsx
<ProfilesScreen useColorPickerAlign={useFrameAutoAlign} /* ...the usual props */ />
```

It is called as `useColorPickerAlign(open, contentWidth, contentHeight, column)` - `open` is whether the swatch
popover is showing, the size is what `InlineColorPicker` itself computes (`@tastic/hud`'s
`getInlineColorPickerContentSize` for the default swatch list at the raw window width), and `column` is a ref
to the roster's scroll view, which clips the popover at its edges: measure it to keep the popover inside a
roster narrower than the frame (a column capped in a wide window) - and must return a
`ProfilePickerAlignResult`, which is handed to `InlineColorPicker` as its `alignOverride` (its `triggerRef`
is the ref that gets measured). It is a hook, not a plain function: give it a stable identity for the life of
the mount (a module-level function), since switching it at runtime remounts the swatch. Omit it and behaviour is
identical to before, and without a hook the popover is kept inside that column for you (`InlineColorPicker`'s
`bounds`, `@tastic/hud` 0.25.0+).

### Routed screens: `ProfilesScreen`

`ProfilesScreen` is the routed-screen shell every app in the fleet was hand-rolling on its own
around `ProfilesManager`: a container `View`, theme-derived bg/fg, a `headerLeft` back button, and
the two-line `managerRef.current?.commitPendingEdit(); onBack()` composition every app's own
back-button handler used to write out by hand (see `ProfilesManager`'s own `commitPendingEdit` doc
above for why that flush matters on a router that doesn't genuinely unmount a popped screen). It
owns that ref itself - there's no `ref` prop on `ProfilesScreen`, since nothing outside it needs
one any more.

Same `profiles`/`defaultColor`/`onCreate`/`onSave`/`onDelete` props as `ProfilesManager` - still
`ProfileEditPatch`-shaped, still deliberately not widened to your own richer `CreateProfileInput`;
compose any extra required fields (a key/control scheme, whatever's specific to your game) in your
own closure at the call site, exactly as you already would calling `ProfilesManager` directly -
plus `onBack`. `fg`/`fgMuted`/`bg`/`titleVariant`/`colorPreview` are all independently
optional and forward straight through to the internal `ProfilesManager` (`bg` is new here -
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
  // Only for wiring onDelete below - clears a deleted profile's own stats record so it doesn't
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

`useProfiles`/`useGameStats` are your own app's hooks, not exports of this package - `profiles` is
whatever `Profile[]` (or your own extended shape) you already keep in Redux/context/state, and
`createProfile`/`updateProfile`/`deleteProfile` are however you already persist it. `onBack` can be
anything with no arguments - `router.back()`, a `safeBack()`-style helper that no-ops with no back
stack behind it, `navigation.goBack()` - `ProfilesScreen` only ever calls it after flushing any
in-progress inline edit first.

### Redux helpers for the shared roster

The cross-app-roster sketch above is a pattern every `@tastic` game was hand-rolling on its own
(a roster reducer, a per-profile extension table, the initial-load decision, a foreground-resync
listener, a per-seat selection reducer). These five pieces are that logic extracted into reusable,
Redux-shaped building blocks - plain TypeScript, no dependency on `redux`/`react-redux` themselves,
so a host app plugs the reducer(s) into whatever store it already has:

- **`profilesActions` / `profilesReducer` / `createProfileRecord`**: the base roster as a reducer:
  `add`/`update`/`remove`/`setAll` actions, plus `createProfileRecord(input)` to mint a complete
  `Profile` (id + timestamps) ready to dispatch via `profilesActions.add`.
- **`createProfileExtensionSlice<TExtension>(namespace)`**: a factory for a host app's own
  per-profile extension fields (a control scheme, a key scheme, ...): returns a
  `{ actions: { set, remove }, reducer }` pair over a plain `Record<profileId, TExtension>`,
  namespaced so more than one extension slice in the same app never collides. Not auto-cleared when
  `profilesReducer` removes a profile - an app already dispatches its own cleanup action(s) on
  delete, so this stays a self-contained reducer rather than new cross-slice wiring.
- **`resolveInitialProfiles(groupId, localFallback)`**: the one-time initial-load decision: shared
  store unavailable → `localFallback` verbatim; shared roster unreadable → `localFallback`, writing
  nothing; shared store empty → seed it from `localFallback`; otherwise the shared roster always
  wins over a possibly-stale local snapshot.
- **`useSharedProfilesSync({ groupId, onRemoteChange })`**: keeps a Redux-backed roster in sync for
  the rest of the app's lifetime: call the returned `syncToShared(next)` right after a local roster
  change to mirror it out, and `onRemoteChange` fires with a freshly-loaded roster whenever the app
  returns to the foreground (skipped while a `syncToShared` write is still in flight, so a remote
  refresh can't clobber a write that hasn't landed yet, and skipped when the read fails).
- **`createProfileSelectionSlice<TSeat>(namespace, defaultState)`**: a factory for the *other*
  per-seat piece of state: which profile id each seat currently has selected (parallel to
  `createProfileExtensionSlice` above, but keyed by seat instead of by profile id). Returns a
  `{ actions: { select, clearProfile, pruneToRoster }, reducer }` pair over a plain
  `Record<TSeat, string | null>`.
  Unlike `createProfileExtensionSlice`, the seat set can't be derived from `TSeat` alone (types
  don't exist at runtime), so callers pass their own `defaultState` - the same literal object (e.g.
  `{ 1: null, 2: null }`) every app already declares today. `select({ seat, profileId })` sets one
  seat's selection; one profile is never on two seats, so picking a profile another seat already
  has swaps the two (that seat takes this seat's previous pick, or guest), and REHYDRATE drops any
  duplicate saved before this rule, keeping the first seat's. A swap moves a profile off a seat
  without that seat's own select handler running, so reset per-seat state tied to the selection
  (a profile color override, below) for both seats when a pick swaps. `clearProfile(profileId)` walks every seat and nulls out any that
  currently points at that id - call it when a profile is deleted so no seat is left referencing a
  ghost id. `pruneToRoster(ids)` nulls every seat whose id is no longer in the given roster; dispatch
  it after both `profilesActions.setAll` paths (the initial `resolveInitialProfiles` reconcile and
  `onRemoteChange`), since a sibling app can delete a profile without this app's own delete ever
  running, and it returns the same state object when nothing changes.
  Always local, like the guest/CPU/override colors below, and never part of the shared
  App Group roster, since who's selected on *this* device is naturally per-app, per-device state.

## Muted profile colors and drawn swatches (`ProfileColorProvider`)

An app that draws profile colors through a transform (Solitaire blends them toward its muted
card-back palette) wraps its tree once:

```tsx
import { ProfileColorProvider } from '@tastic/profile'

const preview = useCallback((hex: string) => blendTowardCardBack(hex, dark), [dark])
<ProfileColorProvider preview={preview}>{children}</ProfileColorProvider>
```

Every `ProfileChip` then draws `preview(profile.color)` (contrast computed against that),
`ProfilePicker`'s selected row fills with it, and `ProfilesManager`/`ProfilesScreen` use it for
their swatch previews unless an explicit `colorPreview` prop is passed. Components from other
packages that render a `ProfileChip` (e.g. `@tastic/hud`'s `AchievementUnlockList`) pick it up
for free. Only what's drawn changes: saved colors, `onCreate`/`onSave` values and selection are
untouched. `useProfileColorPreview()` returns the provider's function (or `undefined`), and
`useProfileDisplayColor(hex)` resolves one color. Without a provider nothing changes.

`renderSwatch` (also optional, with or without `preview`) draws the fill of every round swatch this
package draws, in place of the flat color: `ProfileChip`, the pickers' chip trigger, the Color row's
swatch and the color page's swatches. It's called as `renderSwatch(color, size, place)` with the
drawn color (after `preview`), the circle's diameter and where the swatch is (`ProfileSwatchPlace`:
`'chip'`, `'colorRow'` or `'colorPage'`, 0.16.2+), and its drawing is clipped to the circle, behind
the tag, icon or check. Return `null` (or `undefined`) to keep a swatch's flat fill there. The tag and
check still take their contrast from `color`, so treat it as the primary color of whatever you draw.
Hangman draws a pie of each color's triad where colors are chosen, and keeps its chips flat so their
tags stay legible:

```tsx
import { getTriadicPalette } from '@rific/auto-paper'
import { ProfileColorProvider, type ProfileSwatchRenderer } from '@tastic/profile'

const renderSwatch: ProfileSwatchRenderer = (color, size, place) => (place === 'chip' ? null : <TriadPie colors={getTriadicPalette(color)} size={size} />)
<ProfileColorProvider renderSwatch={renderSwatch}>{children}</ProfileColorProvider>
```

(`TriadPie` is your own component, e.g. three `react-native-svg` arcs.) Give it a stable identity
(module level, or `useCallback`). `ProfilesManager`'s edit row hands it to `@tastic/hud`'s
`InlineColorPicker` too: its trigger (the profile's color with its tag on it) as a `'chip'`, its grid
as the `'colorPage'`. Rows that fill with a color (a selected picker row) stay flat.
`useProfileSwatchRenderer()` returns it (or `undefined`).

## Per-seat color persistence

A loadout/lobby screen's color for a given seat is never just "the selected profile's saved
color" - a seat can be a guest (no profile selected), a CPU opponent, or a profile the player
manually recolored for a clash-swap without touching the profile itself. Every `@tastic` game
(AirHockey, BoxHockey, Pong, LightCycles, Snake) ends up needing the same three cooperating pieces
of state to cover all three cases. This is the established pattern every game should follow - it
was previously undocumented at the package level, which is exactly why two of the five apps
(AirHockey, Snake) didn't pick up the third piece below until after they'd already shipped without
it.

- **`lastGuestColor`**: a `Record<Seat, string>`: what a seat's color was the last time it was a
  guest (no profile selected). Written only when a guest seat's color changes; a profile-selected
  seat never reads or writes it.
- **`lastCpuColor`**: the same idea for the CPU slot, as a single remembered `string` rather than a
  per-seat record (a CPU opponent only ever occupies one fixed seat in every shipped game so far).
- **`profileOverride`**: a `Record<Seat, string | null>`: a manual recolor or clash-swap landing on
  a seat that currently has a profile selected. `null` means "no override - track the profile's own
  saved color live." Cleared only when that seat's own profile selection genuinely changes, never by
  merely leaving and returning to the screen.

All three live in one slice from this package's `createSeatColorsSlice` (since 0.5.0), which every
flagship game uses (see e.g. BoxHockey's or Snake's `src/redux/seatColorsSlice.ts`). This section
exists so a new app's author reads the convention here first, rather than hand-rolling something
that quietly can't interop with the rest of the fleet.

The resolution order at a loadout/lobby screen, for one seat:

```ts
const color = profile
  ? (profileOverride[seat] ?? profile.color) // profile selected: override wins, else the profile's own color
  : isCpu
    ? lastCpuColor // CPU slot: its own remembered color
    : lastGuestColor[seat] // guest seat: that seat's own remembered color
```

`lastGuestColor`/`lastCpuColor` are only ever consulted when no profile is selected for that seat at
all - a profile-selected seat's guest/CPU memory is neither read nor overwritten while it's active,
so switching a seat back to "guest" later still recalls whatever guest color it had before a profile
was ever selected there.

Each seat resolves from its own source, so two of them can land on the same color (a profile saved
as the other seat's guest color, say). Run seat 2's result through `avoidSeatColorClash` after
resolving both:

```ts
const p2Display = avoidSeatColorClash(p1Color, p2Color, [DEFAULT_P1_COLOR, DEFAULT_P2_COLOR])
```

On a clash, seat 2 shows seat 1's default color, or seat 2's default when seat 1 is already on its
own. It's for display only: don't persist it, so a guest's or the CPU's remembered color stays put.

## Install

```bash
npm install @tastic/profile
```

Published to the public npm registry via tag-based CI (OIDC trusted publishing - see
`npm run release:patch`/`:minor`/`:major`).

## Peer dependencies

`react`, `react-native`, `react-native-paper`, `react-native-safe-area-context`, `@rific/auto-paper`
(`defaultColors`, `FadingScrollView`, `getContrastColor`, `useAutoPaperTheme`), `@rific/feedback-press`
(`TouchableRipple`), `@rific/focus-chain` (`useFocusChain`), `@rific/toaster` (`useToast`),
`@tastic/hud` >= 0.23.0 (`ConfirmDialog`, `InlineColorPicker`, `PopoverBody`, `useAutoAlign`,
`usePopoverHost`), `@tastic/core` (a peer of `@tastic/hud` itself) - none of these are bundled, so
use whatever versions your app already has.

This package imports `@tastic/hud` only through its light `@tastic/hud/chrome` entry, never the main
one (which also loads Skia and `@tastic/split-screen`), so an app with neither, like Hangman, can use
every component here. That's why it needs hud 0.23.0, the first whose `./chrome` has the popover
pieces and the color picker.

`expo-modules-core` is an *optional* peer - only resolved by `loadSharedProfiles`/`saveSharedProfiles`
for the native App Group bridge described above; safe to omit entirely on an Android/web-only
consumer.
