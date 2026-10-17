# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

# @tastic/profile

Player profile identity for local-multiplayer React Native games - a saved name/color/tag a player selects per seat, with a selection popover, an inline-editable roster screen, and a reusable identity badge. Deliberately blind to any app-specific fields (control scheme, stats, anything else keyed by profile id) - a host app extends the base `Profile` type and layers those on its own side.

Part of the `@tastic`/`@rific` package ecosystem. Published at https://www.npmjs.com/package/@tastic/profile.

## Commands

```bash
npm run build        # tsup, outputs CJS + ESM + types to dist/
npm run build:watch  # tsup --watch
npm run lint         # ESLint
npm run fix          # ESLint --fix
npm test             # Jest (291 tests)
npm run test:watch   # Jest in watch mode
npm run typecheck    # TypeScript type check (tsc --noEmit)
npm run verify       # lint + test + typecheck + build, in that order
```

Always run `npm run lint` before finishing any task.

## Release

Tag-based, using npm trusted publishing (OIDC, no token required):

```bash
npm run release:patch   # npm version patch && git push --follow-tags (or release:minor / release:major)
```

`preversion` runs `npm ci && npm run verify` first. The `publish.yml` workflow fires on `v*` tags and delegates to the shared reusable workflow (`infinitetoken/Workflows/.github/workflows/npm-publish.yml@v1`) with `id-token: write` permission for OIDC trusted publishing.

## Architecture

```
src/
  index.ts                  - all public exports
  types.ts                  - Profile interface: id, name, color, tag, createdAt, updatedAt
  profilesValidation.ts     - MAX_PROFILE_NAME_LENGTH/MAX_TAG_LENGTH, isValidTag (plain chars or one ZWJ-joined emoji), isValidProfile (base-fields-only validator)
  sharedProfileStore.ts     - optional cross-app roster via a native iOS App Group, or localStorage on the web (see "The web roster" below); lazily/optionally resolves expo-modules-core's TasticProfile native module, degrades to unavailable (empty reads, no-op writes) on Android. readSharedProfiles tells a failed read (null) from an empty roster ([]); loadSharedProfiles flattens both to []; subscribeSharedProfiles delivers another tab's save on the web
  seatColorClash.ts         - avoidSeatColorClash(p1Color, p2Color, [p1Default, p2Default]): seat 2's display color moved off seat 1's when both resolve to the same color
  redux/                    - optional Redux-shaped state helpers; no dependency on redux/react-redux, a host app plugs these into its own store
    createActionCreator.ts    - internal `{ type, match }` action-creator factory shared by the slices below; not exported from index.ts
    profilesSlice.ts          - profilesActions (add/update/remove/setAll) + profilesReducer over Profile[], plus createProfileRecord(input) to mint a new Profile
    profileExtensionSlice.ts  - createProfileExtensionSlice<TExtension>(namespace) factory: a host app's own per-profile fields (control scheme, key scheme, ...) as a namespaced Record<profileId, TExtension> slice
    profileSelectionSlice.ts  - createProfileSelectionSlice<TSeat>(namespace, defaultState) factory: select/clearProfile/pruneToRoster actions over which profile each seat last picked (always local, per-device, never the shared roster), generalizing an identical hand-rolled Record<Seat, string | null> reducer 5 @tastic games each carried separately
    seatColorsSlice.ts        - createSeatColorsSlice<TSeat>(namespace, defaultState, mountKey?) factory: a seat's remembered guest color, CPU color, and each profile's own color pick in the game (`profileColors`, by profile id, read through `profileSeatColor`; a per-seat `profileOverride` until 2026-10-17), generalizing an identical hand-rolled slice 4 @tastic games each carried separately; all 5 flagships use it (Snake moved off its own gameSlice fields onto it 2026-10-08)
    resolveInitialProfiles.ts - one-time initial-roster decision: local fallback when the shared store is unavailable, unreadable or empty (seeding it only when empty), otherwise shared always wins
    useSharedProfilesSync.ts  - keeps a Redux-backed roster in sync with the shared store: syncToShared() mirrors writes out, an AppState listener refreshes on foreground
  ProfileChip.tsx           - a profile's identity at a glance: filled color circle + tag (or fallback account icon) in a contrast-safe color
  ProfileColorContext.tsx   - ProfileColorProvider: app-wide drawn-color transform for profile colors (Solitaire's muted palette) and an optional swatch renderer (Hangman's triad pie)
  SwatchLayer.tsx           - internal (not exported from index.ts): a renderSwatch drawing in place of a swatch's flat fill, absolutely placed and clipped to the circle; used by IdentityChip and PickerMenu
  PickerMenu.tsx            - internal (not exported from index.ts): the trigger (plain name or chip pill), the bordered menu, the Color row and color page, IconRow, pickerContentSize; shared by ProfilePicker and OptionPicker
  ProfilePicker.tsx         - name trigger + selection popover; generic over an app's own richer Profile type; selection-only (no create/rename/delete)
  OptionPicker.tsx          - the chip button and dropdown for a seat with no profile (a CPU seat's difficulty levels), under the same Color row
  ProfilesManager.tsx       - the roster screen: create/rename/recolor/retag/delete inline in the tapped row, with @tastic/hud's destructive ConfirmDialog to confirm a delete; no navigation of its own
  ProfilesScreen.tsx        - routed screen shell wrapping ProfilesManager: container View + theme-derived bg/fg + back button + commit-pending-edit-before-navigate composition, folding in what every fleet app used to hand-roll around ProfilesManager itself (see "Profiles screen extraction" below)
  __mocks__/
    react-native.ts         - jest mock: StyleSheet, Platform, Appearance, View/ScrollView/Pressable/useWindowDimensions stubs
    react-native-paper.ts   - jest mock: Icon/IconButton/Text stubs
  __tests__/
    ProfileChip.test.tsx
    ProfilePicker.test.tsx
    ProfilesManager.test.tsx
    ProfilesScreen.test.tsx
    OptionPicker.test.tsx
    hudImports.test.ts      - every quoted '@tastic/hud...' specifier under src/ (imports, jest.mock, require) is '@tastic/hud/chrome'
    profileExtensionSlice.test.ts
    profilesSlice.test.ts
    profileSelectionSlice.test.ts
    profilesValidation.test.ts
    resolveInitialProfiles.test.ts
    seatColorClash.test.ts
    seatColorsSlice.test.ts
    sharedProfileStore.test.ts
    useSharedProfilesSync.test.ts
ios/
  TasticProfileModule.swift - Expo Module (`TasticProfile`) wrapping UserDefaults(suiteName:) as a generic group/key JSON bridge; apple-only per expo-module.config.json
  TasticProfile.podspec
```

## Public API

From `src/index.ts`:

- `ProfileChip` - identity badge component (`profile`, `size?`, `filled?`); draws `ProfileColorProvider`'s preview of `profile.color` when one is mounted
- `ProfileColorProvider` / `useProfileColorPreview` / `useProfileDisplayColor` / `useProfileSwatchRenderer`, `ProfileSwatchRenderer` (type) - app-wide drawn-color transform (2026-09-25) and swatch renderer (2026-10-17, see "Three-color swatches" below). Both props are optional. A context, not a per-component prop, because the prop-only `colorPreview` on `ProfilesScreen` had left `ProfilesManager`'s roster chips and `ProfilePicker`'s rows drawing Solitaire's profiles unmuted; also reaches `ProfileChip`s rendered by other packages (`@tastic/hud`'s `AchievementUnlockList`). An explicit `colorPreview` prop on `ProfilesManager`/`ProfilesScreen` still wins over it.
- `ProfilePicker` - generic selection-popover component (see Architecture above). `takenId?` disables one other seat's profile; `takenIds?: readonly string[]` (2026-10-17) disables several, for a lobby with more than two seats, skipping the picker's own selection. Placement seam for hosts inside a fake-rotated frame (a View turned +-90deg on a portrait-locked OS, where `useAutoAlign`'s window-relative measurement picks the wrong side): optional `alignOverride?: ProfilePickerAlignResult` (substitutes the whole placement - align/verticalAlign/maxHeight/measured/triggerRef; a forced `align` prop still beats its `align`) and `rotation?: PopoverRotation` (default 0, forwarded to `useAutoAlign`; deliberately NOT read ambiently from `@tastic/core`, which this package never imports at runtime, so existing callers behave identically). Both mirror `@tastic/hud`'s `InlineColorPicker`.
- `OptionPicker`, `OptionPickerOption`, `getOptionPickerContentSize(optionCount, colorSection?)` - ProfilePicker's chip button for a list of options instead of profiles (see "The seat button" below)
- `getProfilePickerContentSize(profileCount, hasManageRow?)`, `ProfilePickerContentSize`, `ProfilePickerAlignResult` - the popover's `{ width, height }` as the component feeds it to `useAutoAlign` (the single formula; it omits the menu's 2pt border and the Manage divider, ~13pt, so it is a placement estimate), so a host sizing its own `alignOverride` hook can't drift; `ProfilePickerAlignResult` is declared locally (structurally identical to `@tastic/hud` >= 0.12.0's `AlignResult`, which the peer range `>=0.8.0` doesn't guarantee exists), so hud's own `AlignResult` is assignable to it. `rotation` needs `@tastic/hud` >= 0.8.0 to have any effect (`useAutoAlign`'s 4th parameter and the `PopoverRotation` export arrived there); older versions ignore it.
- **`ProfilesManager`/`ProfilesScreen` `useColorPickerAlign?: (open, contentWidth, contentHeight) => ProfilePickerAlignResult`** - the same fake-rotation seam for the edit row's colour swatch, which `ProfilesManager` renders itself (its popover state is internal, so a host can't reach `InlineColorPicker`'s `alignOverride`). Called by a small internal `AlignedColorPicker` (rendered INSTEAD of the plain `InlineColorPicker` only when the prop is given, so the hook is always called unconditionally and the plain path is unchanged), sized with hud's `getInlineColorPickerContentSize(defaultColors.length, useWindowDimensions().width)` exactly as `InlineColorPicker` sizes itself, and its result is passed as `alignOverride` (so hud >= 0.12.0 to have an effect). Give the hook a stable identity per mount. Tests in `ProfilesManager.test.tsx`/`ProfilesScreen.test.tsx`.
- `ProfilesManager`, `ProfilesManagerProps`, `ProfilesManagerHandle`, `ProfileEditPatch` - roster management screen; accepts `ref` (React 19 ref-as-prop, no `forwardRef`) exposing `commitPendingEdit()` - a host whose router doesn't genuinely unmount this component on "back" (React Navigation's web renderer keeps popped screens mounted-but-hidden, unlike native) must call this explicitly from its own back-button handler, or a pending edit is silently lost there. The existing unmount-effect fallback still covers every host where navigating away really does unmount (native, hardware back/swipe-back bypassing a custom back button). `ProfileEditPatch` (`name`/`color`/`tag`) is the shape `onCreate`/`onSave` both take - was a private, unexported interface inside `ProfilesManager.tsx` until the `ProfilesScreen` extraction below needed to reference it publicly from `ProfilesScreenProps`'s own `onCreate`/`onSave`, surfacing a small pre-existing gap in this package's public surface rather than adding new API for its own sake.
- `ProfilesScreen`, `ProfilesScreenProps` - routed profiles-roster screen shell wrapping `ProfilesManager` (see "Profiles screen extraction (2026-09-18)" below for what it owns and why); stays props-in/callbacks-out like `ProfilesManager` itself, never calling a host's own `useProfiles()`/`useGameStats()`-shaped hooks internally, since those hooks' shapes are genuinely per-app
- `isValidProfile`, `isValidTag`, `MAX_PROFILE_NAME_LENGTH`, `MAX_TAG_LENGTH` - validation
- `isSharedProfileStoreAvailable`, `readSharedProfiles`, `loadSharedProfiles`, `saveSharedProfiles`, `subscribeSharedProfiles` - optional shared store: the native App Group on iOS, localStorage on the web (`readSharedProfiles` resolves to `null` on a failed read; `loadSharedProfiles` is the older form that flattens that to `[]`; `subscribeSharedProfiles` is web-only, a no-op elsewhere)
- `profilesActions`, `profilesReducer`, `createProfileRecord`, `CreateProfileInput`, `UpdateProfilePayload` - base roster as a Redux reducer (add/update/remove/setAll) plus a helper to mint a new `Profile`
- `createProfileExtensionSlice`, `ProfileExtensionActions`, `ProfileExtensionSlice`, `ProfileExtensionState`, `SetProfileExtensionPayload` - factory for a host app's own namespaced per-profile-id extension slice
- `resolveInitialProfiles` - one-time initial-roster resolution against the shared store
- `useSharedProfilesSync`, `UseSharedProfilesSyncOptions`, `UseSharedProfilesSyncResult` - keeps a Redux-backed roster synced with the shared store over the app's lifetime
- `createProfileSelectionSlice`, `ProfileSelectionActions`, `ProfileSelectionSlice`, `ProfileSelectionState`, `SelectProfilePayload` - factory for a host app's own per-seat "which profile is selected here" slice
- `createSeatColorsSlice`, `SeatColorsActions`, `SeatColorsSlice`, `SeatColorsState`, `SetLastGuestColorPayload`, `SetProfileColorPayload`, `ProfileColorPick`, `profileSeatColor` - factory for a host app's own remembered-color slice (each seat's guest color, the CPU color, each profile's pick), and the read of a profile seat's color
- `avoidSeatColorClash` - seat 2's display color moved off seat 1's on a clash (see "Bug fixes (2026-10-15)" below)
- `Profile` (type only) - the base identity shape

## Peer Dependencies

The ranges are `package.json`'s `peerDependencies`; keep this list in step with it (it had drifted to auto-paper >=0.9.0 and hud >=0.1.3 until 2026-10-17).

- `react` >=19.0.0, `react-native` >=0.76.0, `react-native-paper` >=5.0.0, `react-native-safe-area-context` >=4.0.0 - required
- `@rific/auto-paper` >=0.13.0 (`defaultColors`, `FadingScrollView`, `getContrastColor`, `useAutoPaperTheme`) - required
- `@rific/feedback-press` >=0.10.0 (`TouchableRipple`) - required
- `@rific/focus-chain` >=0.4.0 (`useFocusChain`) - required
- `@rific/toaster` >=0.4.0 (`useToast`) - required
- `@tastic/core` >=0.1.0 - required (a peer of `@tastic/hud`; this package never imports it at runtime)
- `@tastic/hud` >=0.23.0, through its `./chrome` entry only (`ConfirmDialog`, `getInlineColorPickerContentSize`, `InlineColorPicker`, `PopoverBody`, `useAutoAlign`, `usePopoverHost`, and the types `PopoverHost`, `PopoverRotation`) - required. 0.23.0 is the first hud whose `./chrome` has the popover pieces and the color picker
- `expo-modules-core` >=1.0.0 - optional (`peerDependenciesMeta`); only used by `sharedProfileStore.ts`'s App Group bridge, guarded by `try { require(...) }`, so it's safe to omit entirely on Android/web-only consumers (the web store needs nothing from it)

## Testing

- Framework: Jest (`@infinitetoken/jest-config/react-native`), jsdom environment
- Mocks in `src/__mocks__/` for `react-native`, `react-native-paper`; the suites that need hud mock `@tastic/hud/chrome` (the specifier the source imports)
- 291 tests across 15 suites
- Coverage (measured 2026-09-15): **100 / 94.44 / 98.41 / 100** (statements/branches/functions/lines),
  against the shared preset's 70% floor on all four metrics - no local `coverageThreshold` override.
  Branch gaps are in `ProfilesManager.tsx` (lines 88, 108-115, 208-235); the one function gap is
  `useSharedProfilesSync.ts`'s no-op `.catch()` handler on `saveSharedProfiles`, never exercised
  because no test makes that write actually reject
- No local `jest.config.cjs` overrides beyond `moduleNameMapper` for the two `__mocks__/` entries -
  `@infinitetoken/jest-config@0.2.1`'s `/react-native` preset defaults
  `testEnvironmentOptions.customExportConditions: []` itself, needed here since `@tastic/hud` (imported
  for real, unmocked, in `ProfilePicker.tsx`/`ProfilesManager.tsx`) has the same `"browser"` exports
  condition pointing at raw `src/index.ts` that broke `@tastic/core` consumers before the fix

## The web roster (2026-10-17)

For Jay's move of the web games onto one origin, games.infinitetoken.com/<game>/ (Games-Web hosts it; see its CLAUDE.md). localStorage is per origin, so on one origin every game can share the roster the way the iOS App Group does. Not released yet; it wants a minor (a new export and new web behavior). Version bump and release are Jay's.

- **Where:** `sharedProfileStore.ts`, not a `.web.ts` file (that would be missing from `dist`). When no native module loads and `Platform.OS === 'web'`, `native` is a localStorage adapter with the same `getSharedJSON`/`setSharedJSON` shape, so `readSharedProfiles`/`saveSharedProfiles` and every consumer are unchanged. Key: `<groupId>:sharedProfiles` (`group.com.infinitetoken.tastic:sharedProfiles` for the fleet). Android stays unavailable; `expo-module.config.json` is unchanged.
- **Never a silent wipe:** the adapter writes and removes a probe key once at load and stays unavailable if touching localStorage throws (storage blocked, a sandboxed frame): a store that took writes and kept none would leave the key missing, the next read would return [] and `useSharedProfilesSync` would hand that over as the roster. After a write that fails anyway (the quota), reads fail (so `readSharedProfiles` returns null and nothing is replaced) until a write succeeds.
- **Two windows:** `subscribeSharedProfiles(groupId, listener)` listens to the browser's `storage` event (which only fires in OTHER tabs) for the roster key, runs the same parse, and skips a removal, a `clear()` and an unreadable blob, so none of them can spread a wipe. `useSharedProfilesSync` subscribes next to its AppState listener, with the same pending-write and cancelled guards, so the games need no change. Before it, two visible windows only saw each other's edits after a tab switch, and the last writer won.
- **Games:** Snake, Solitaire and LightCycles use `resolveInitialProfiles`/`useSharedProfilesSync` with the same group id, so they pick it up with the release. Each game's own redux-persist state is namespaced too (`keyPrefix: '<game>:'`), or they'd overwrite each other's `persist:root` on one origin.
- Tests: `sharedProfileStore.test.ts`'s web describe (round trip and key, [] vs null, unavailable off the web, with blocked storage and with a storage that takes no writes, the failed-write latch, the storage event and what it ignores) and `useSharedProfilesSync.test.ts`'s remote-save describe. Checked 2026-10-17 on a local server with the hub, Snake and LightCycles on one origin (each built with these two files copied over its installed 0.15.0, then put back): a profile created on Snake's Profiles screen was in LightCycles' on load, and one created in a LightCycles tab appeared in a background Snake tab without a reload or a tab switch (the storage event). Not checked on a deployed site or in Safari.

## hud's chrome entry, three-color swatches and takenIds (2026-10-17)

For Hangman, which wants `ProfilePicker`/`ProfilesScreen` and has no Skia, `@tastic/profile`-dependent lobby or `@tastic/split-screen`. Not released yet; it wants a minor (the `@tastic/hud` peer floor rises to 0.23.0). Version bump and release are Jay's.

- **Every hud import is `@tastic/hud/chrome`** (`PickerMenu.tsx`, `ProfilePicker.tsx`, `OptionPicker.tsx`, `ProfilesManager.tsx` and the three suites' mocks), type-only names as `import type`. hud's main entry also re-exports the per-seat lobby, `AchievementUnlockList` and the Skia gauge, so one import from it made every app using this package need Skia and split-screen. hud 0.23.0 added `PopoverBody`, `PressAwayOverlay`, `usePopoverHost`/`PopoverHost`, `useAutoAlign` and its types, `InlineColorPicker` and `getInlineColorPickerContentSize` to `./chrome` for this (hud commit 31cf73b); `ConfirmDialog` was already there. The peer floor and the devDependency are 0.23.0 (`>=0.23.0`, `^0.23.0`). Guarded twice: `eslint.config.cjs` bans the bare `'@tastic/hud'` with `no-restricted-imports`, and `src/__tests__/hudImports.test.ts` checks every quoted hud specifier under `src/` (which also covers `jest.mock()` and `require()`, which the lint rule doesn't see) is the chrome entry. `ProfilePickerAlignResult` stays declared locally, though hud's `AlignResult` is now guaranteed by the floor.
- **The lockfile recorded hud 0.22.0** until 2026-10-17 (made before hud 0.23.0 was published), so `npm ci` and `preversion` failed. Refreshed then against the published 0.23.0 (`npm install`, then `npx -y npm@10 install --package-lock-only` for CI's npm 10); not committed yet. Developed and verified against the unreleased hud through yalc (`npx yalc add @tastic/hud`, then `package.json` restored by hand).
- **`ProfileColorProvider`'s `renderSwatch?: (color, size) => ReactNode`** replaces the flat fill of every round swatch this package draws: `IdentityChip` (so `ProfileChip`, and the pickers' chip trigger, `OptionPicker`'s CPU chip included), `PickerMenu`'s Color row swatch (22pt) and every color page swatch (28pt, or 24 inside the selected one's 2pt white ring). `color` is the drawn color (after `preview`/`previewValue`) and stays the primary one: the tag, icon, check, X, swap icon and home dot take their contrast from it, as before. Hangman passes a pie of each color's triad (auto-paper's `getTriadicPalette`). The drawing sits in the internal `SwatchLayer` (absolute at the swatch's top left, inside any border, `overflow: hidden` and round, no pointer events), behind the mark. A color page swatch's `TouchableRipple` takes one child (Paper's `React.Children.only`), so with a renderer the drawing and the mark share an absolute-fill face View; without one the swatch's child is the mark alone, as before. Without `renderSwatch` nothing changes. `preview` is optional now too, so a provider can give either or both. Not covered: rows that fill with a color (a selected picker row) stay flat, an unfilled `ProfileChip` draws nothing, and hud's `InlineColorPicker` (ProfilesManager's edit-row color trigger and swatches) draws its own flat swatches and doesn't read this context.
- **`ProfilePicker`'s `takenIds?: readonly string[]`**, alongside `takenId`, for an N-seat lobby: every id in it is disabled (dimmed, and a press does nothing), the same as `takenId`. Unlike `takenId`, a `takenIds` entry never disables the picker's own selection, so a host can pass every seated id, its own included. `takenId` is unchanged.
- Tests: `hudImports.test.ts` (2), `ProfileChip.test.tsx`'s renderSwatch describe (6: the fill in place of the flat color, preview's color handed to it, nothing for an unfilled chip, the chip trigger's `IdentityChip`, either prop alone and the hooks, the flat fill without a provider), `ProfilePicker.test.tsx`'s takenIds cases (4) and renderSwatch describe (4: the Color row swatch, the color page sizes in and out of the ring with no flat fill, contrast from the swatch's color with one child per swatch, flat swatches without it).

## Profiles screen extraction (2026-09-18)

**`ProfilesScreen` (`src/ProfilesScreen.tsx`) is a new export wrapping `ProfilesManager` with the routed-screen shell every one of the fleet's 5 apps (Snake, AirHockey, BoxHockey, Pong, LightCycles) was hand-rolling separately in its own `app/profiles.tsx`.** Snake/AirHockey/Pong's copies were verified byte-identical (diffed with comment lines stripped) before this landed; BoxHockey and LightCycles diverged in exactly two load-bearing, pre-existing ways that `ProfilesScreenProps` was shaped around rather than papered over (see below). Lives next to `ProfilesManager` rather than moving into `@tastic/hud` - it has zero generic/non-profile UI content, so it's one layer up from `ProfilesManager`, not a different kind of component.

- **What moved in from every app's hand-rolled version:** the container `View`, theme-derived bg/fg (the same literal black/white-by-appearance formula `ProfilesManager` already defaults to), a `headerLeft` back button (`@rific/feedback-press`'s `IconButton`, `icon='arrow-left'`, `accessibilityLabel='Back'`), and the `managerRef.current?.commitPendingEdit(); onBack()` two-line composition every app's own `handleBack` used to write out by hand. `ProfilesScreen` owns the `ProfilesManagerHandle` ref itself now - there's no `ref` prop on `ProfilesScreen`, since nothing outside it needs one any more: it's the one thing that both renders `ProfilesManager` and owns the only navigation trigger next to it.
- **`onCreate`/`onSave`/`onDelete` stay `ProfileEditPatch`-shaped, deliberately not widened to a host's own richer `CreateProfileInput`** - same reasoning as `ProfilesManager`'s identical props. A host whose profile shape has extra required fields composes them in its own closure at the call site (BoxHockey: `(patch) => createProfile({ ...patch, controlScheme: NEW_PROFILE_CONTROL_SCHEME })`; LightCycles: the same shape for `keyScheme`), exactly as it already did calling `<ProfilesManager>` directly. That's what let 3 of the 5 apps adopt `ProfilesScreen` with a one-line `onCreate` and the other 2 need no more adaptation than they already had - including LightCycles' own `defaultColor` divergence (its local `DEFAULT_P1_COLOR` constant instead of `@rific/auto-paper`'s `defaultColors[0].value`), which `defaultColor` staying a plain required string (never defaulted internally) keeps working unchanged.
- **`ProfileEditPatch` is now exported** - see its own Public API entry above. It was `ProfilesManager.tsx`-private until `ProfilesScreenProps.onCreate`/`onSave` needed to reference it publicly; exporting it was a one-line, pre-existing gap this extraction surfaced rather than new API invented for its own sake.
- **This subsumes and replaces the separate, never-built 'profiles-handleback' hook design** (a standalone `useCommitAndBack`-style hook that would have wrapped the same commit-then-navigate composition). Grepping every app's `game.tsx` back-button wiring confirmed that composition has no call site anywhere outside `app/profiles.tsx` - `game.tsx`'s own back buttons are a structurally different, unrelated chip-style button with no `ProfilesManagerHandle` involved at all. With `ProfilesScreen` now folding in its only real call site directly, a standalone hook built separately would have shipped with zero remaining consumers.
- `titleVariant`'s `MD3TextVariant` union is a second, separately-declared copy of `ProfilesManager.tsx`'s own local type alias (react-native-paper's MD3 Text variant names, not exported from its public entry point) rather than one shared between the two files - same call `ProfilesManager.tsx` already makes for why it's inlined instead of imported from react-native-paper's internals.
- `src/__tests__/ProfilesScreen.test.tsx` mirrors `ProfilesManager.test.tsx`'s own structure but mocks `ProfilesManager` down to `jest.fn(() => null)` (same convention `ProfilePicker.test.tsx` uses for its sibling `ProfileChip`) - it only asserts `ProfilesScreen`'s own wiring (props/callbacks pass through unchanged, `headerLeft` is a labeled back-arrow `IconButton`, and the back button calls `commitPendingEdit` before `onBack` via `invocationCallOrder`, with a no-handle-attached-yet case covered too), not `ProfilesManager`'s own rendering.
- Now `0.6.0` (minor - `ProfilesScreen`/`ProfilesScreenProps` and the newly-exported `ProfileEditPatch` are new/newly-public surface, no breaking change to anything existing).

## The delete confirmation is hud's ConfirmDialog (2026-10-15)

`ProfilesManager`'s "Delete Profile?" used to be its own card: literal black/white (or the host's
`cardBg`), a 1pt border, and Cancel and Delete as two stacked contained 160pt buttons. Jay wants one look
for every dialog in the fleet ("I value consistency above all else"), so it is now `@tastic/hud`'s
`ConfirmDialog` (`destructive`, `icon='alert-outline'`, Cancel/Delete side by side, the theme's
untinted blurred card and DialogHeader), the same card as Reset Everything?, Quit Match? and every
app's New Game confirm. `ConfirmDialog` has had `destructive` since hud 0.7, so the `>=0.12.0` peer
range still holds. `cardBg` (ProfilesManager and ProfilesScreen) only ever colored that card, so it is
gone; Solitaire was the only app passing it. The tests read the props handed to a `ConfirmDialog` stub.

## ProfilePicker color section and chip trigger (2026-10-16)

For Solitaire's Home (Jay: a color swatch beside the profile dropdown didn't read as a color for that game only, or as a different thing from the profile). Additive: a picker without the new props renders and sizes exactly as before. Released in 0.14.0, a minor (the `@rific/auto-paper` peer floor rises).
- **`colorSection?: ProfilePickerColorSection`** (`{ value, onChange, previewValue?, swatches?, label?, caption? }`): a **Color row** at the top of the list (a 22pt swatch of the color in effect, the label (default 'Color') with the caption under it, a chevron; 48pt with a caption, 36 without), then a divider. Tapping it swaps the popover's contents for the **color page**: a back row (chevron-left and the label) and the swatch grid (Jay, 2026-10-16: he expected the swatches nested behind a row, not laid out above the profiles; the first version did that and was replaced the same day). A press away closes the whole popover, not just the page; every press of the trigger starts on the list again (`colorPage` state, reset in `handleTriggerPress`, so no effect). Swatches are hud `InlineColorPicker`'s (28pt circles, the selected one ringed white and checked, `previewValue` drawing each), spread 5 across to exactly the rows' content width (176pt, 9pt apart both ways, so 20 colors are 4 full rows). A press calls `onChange` and stays on the page, so several can be tried. `getProfilePickerContentSize(profileCount, hasManageRow, colorSection)` is the taller of the two pages, exactly (pass the same object), so one placement fits either page; the `FadingScrollView` is keyed by page so a swap starts at the top.
- **The selected profile's own color carries a dot** on the color page (`ColorPage`'s `homeColor`, in `PickerMenu.tsx` since 2026-10-17, an 8pt dot in the swatch's contrast color, and `, profile color` on its accessibility label) while another color is in effect; the check takes its place when they are the same swatch, and the null selection or a color outside `swatches` gets none. It is the way back for a host whose `value` can be a pick on top of the profile's color (Solitaire).
- **The chip trigger:** with a `colorSection`, the trigger leads with an `IdentityChip` (32pt) in `color` with the selected profile's tag (`nullIcon` for the null selection), then the name and the chevron, padded into a 44pt pill; `triggerStyle?` styles the pressable (a host's background). The padding sits on the MEASURED view, so placement measures the pill's real edge (measured from inside it, a popover opening toward a screen edge ran 2pt past it). The caret points at the pill's middle: `triggerSize` is the anchor's measured width (`onLayout`), which assumes the host doesn't stretch the anchor wider than the pill.
- **Plain fg for two labels (2026-10-16, Jay took the advice):** the chip trigger's name and chevron, and the Manage label (every picker with `onManage`, not only the chip one), are drawn in `fg` (white/black by `dark`) instead of `color`: a muted accent on black read dim, Manage almost disabled. The accent stays on the chip, the Manage icon, the border, the caret and the dividers. The PLAIN trigger keeps its name in `color`, which is what tells a multi-seat game's seats apart.
- **Known, not changed:** the selected swatch's ring is white in both modes (as in hud's `InlineColorPicker`), so on the light menu only the check marks it.
- **Manage is pinned below the scrolling rows (0.14.1, Jay asked for it after 0.14.0):** the menu box is the scroller plus a footer (`menuFooter`: the divider and the Manage row, on the list page only), like a dialog's Done under its rows, so Manage is always reachable and the rows fade out above its divider. It used to be the list's last row and scrolled away with it. The heights are unchanged (the scroller drops its bottom padding, the footer carries it), so `getProfilePickerContentSize` is too. Seen in BoxHockey's web loadout at 402x520 with 14 profiles: 548pt of rows in a 269pt scroller, Manage pinned, the bottom fade on from the start. (A hidden Browser pane throttles React Native Web's resize-observer `onLayout`, so the fade can look missing until a frame is drawn; not a bug.) Pinned by `ProfilePicker.test.tsx`'s "is pinned below the scrolling rows" (fails with Manage back inside).
- **The menu scrolls with auto-paper's `FadingScrollView`** (the dialogs' edge fade), inside a plain View that carries the box (background, border, max height), so only the rows fade. That raised the `@rific/auto-paper` peer to `>=0.13.0`; without a `maskedView` on the app's auto-paper Provider it scrolls with no fade on iOS/Android.
- **`ProfilesManager`'s edit row now has `zIndex: 1`.** Its color popover lives inside the row, and a zIndex only orders siblings of one parent (React Native Web also gives every positioned view its own stacking context), so every row after the edited one was drawn over the open swatches (Jay found it in Solitaire's Profiles screen: the Kid and New Profile rows across Dad's popover). Older than this change. Pinned by `ProfilesManager.test.tsx`'s "edit row stacking" (fails without it).
- **`IdentityChip`** (internal, `src/IdentityChip.tsx`): `ProfileChip`'s drawing taking the color as given, shared by `ProfileChip` and the chip trigger. A 3-character tag now draws at 0.32 of the chip instead of 0.4: three wide bold letters (DAD in DejaVu Serif Bold) are a whole chip wide at 0.4, and react-native-web ignores `adjustsFontSizeToFit`, so the web build cut them off ("D..."); `adjustsFontSizeToFit` stays the backstop on native.
- Tests: `ProfilePicker.test.tsx`'s `colorSection` describe (chip props, null icon, triggerStyle, caret from the measured width, the Color row and its caption above the profile rows with no swatches on the list, the swap to the color page and back, the trigger starting on the list, the profile-color dot (and the check replacing it, none for the null selection), swatches drawn/checked case-insensitively, a press commits the raw color and doesn't close, exact page sizes) and `ProfileChip.test.tsx` (the 0.32 ratio). Seen in Solitaire's web build only (see its CLAUDE.md, "The player button").

## The seat button (2026-10-17)

Solitaire's player button made the fleet's seat control (Jay, 2026-10-16): `@tastic/hud`'s `PlayerSetupPanel` now draws every loadout seat as ONE button with the color behind a Color row, in AirHockey, BoxHockey, LightCycles, Pong and Snake (and ArcheryDuel's own panel). Released in 0.15.0, a minor (the seat-colors slice's shape changed).

- **`PickerMenu.tsx`** (internal): everything `ProfilePicker` drew around its rows (the trigger, the menu box and its `FadingScrollView`, the pinned footer, the Color row, the color page) moved out unchanged, with an `IconRow` for icon-led rows (ProfilePicker's null row, every OptionPicker row) and `pickerContentSize(rowCount, colorSection?)`. `ProfilePicker`'s props, output and sizes are the same; its 72 existing tests pass untouched.
- **`OptionPicker`** (`id`, `host`, `options: { value, label, icon? }[]`, `value`, `onChange`, `color`, `dark`, `icon`, `rowIcon?`, `colorSection?`, `align?`, `alignOverride?`, `rotation?`, `triggerStyle?`): always the chip trigger (a chip in `color` with `icon`, then the selected option's label), the options as icon rows (the selected one filled with `color`), a row press commits and closes. `getOptionPickerContentSize` is the same formula as `getProfilePickerContentSize` with one row per option.
- **`colorSection.takenValue` / `allowSwapTaken`**: another seat's color on the color page, faded with an X and disabled (`, taken`), or with a swap icon and pickable (`, swap`) for a host that swaps the two (a CPU on the other seat), the same as hud's `InlineColorPicker`. The color in effect is never marked taken.
- **Per-profile picks in `createSeatColorsSlice`** (breaking): `profileOverride: Record<Seat, string | null>` and `setProfileOverride` are gone. `profileColors: Record<profileId, { color, profileColor }>` holds each profile's pick in this game, written with `setProfileColor({ profile, color })` (null, or the profile's own color, drops it) and read with `profileSeatColor(profile, profileColors)`, which only uses a pick while the profile still has the color it was picked against. So a pick follows the profile (kept through a switch to another profile and back, a move to the other seat, a relaunch), the same rule as Solitaire's own `tableColorSlice`. The reducer also listens to `profilesActions`: `remove` drops the pick, and `update`/`setAll` with a new color for the profile drop it (a rename keeps it; a profile missing from a `setAll` roster keeps its pick, like `pruneToRoster` leaves stats). REHYDRATE drops an old saved `profileOverride`, so every profile starts on its own color once.
- Tests: `OptionPicker.test.tsx` (8), `ProfilePicker.test.tsx`'s taken/swap cases (3), `seatColorsSlice.test.ts` rewritten for the new shape (picks, drops, the roster actions, `profileSeatColor`, the legacy key dropped on REHYDRATE). Checked live in Snake's web loadout (see Snake's CLAUDE.md, "The seat button").

## Dependencies brought up to date for the 0.15.0 release (2026-10-17)

Dev dependencies moved to Expo SDK 58, as toaster and auto-paper did on 2026-10-16: `react-native` ^0.88.0, `expo-modules-core` ^58.0.20, `@infinitetoken/tsconfig` ^0.6.0, `@infinitetoken/jest-config` ^0.5.2, and the fleet's own `@rific/auto-paper` ^0.13.3, `@rific/toaster` ^0.8.1 and `@tastic/hud` ^0.20.0. TypeScript, ESLint and tsup stay on 6, 9 and 8, like the rest of the fleet. `tsconfig.json`'s `customConditions` (set here to keep tsc off sibling packages' raw source) now lists `react-native-legacy-deep-imports`, the preset's temporary condition for React Native 0.88's pre-strict types; with `[]` it dropped it and failed on the three strict-type errors in TODO.md. Peer ranges unchanged.

## The roster's edge fade (2026-10-16)

`ProfilesManager`'s rows scroll in `@rific/auto-paper`'s `FadingScrollView` (the peer floor, 0.13.0, already has it), so they fade out at an edge while there is more past it, like the Settings sheet, `ProfilePicker`'s rows and `@tastic/hud`'s `BaseStatsScreen` (Jay: every scrolling screen alike). `keyboardShouldPersistTaps` and the hidden indicator pass straight through to its ScrollView. On iOS/Android it only fades when the host hands auto-paper's Provider a `maskedView`; without one the rows just scroll. `ProfilesManager.test.tsx` mocks it as a pass-through and pins it. A color popover that opens over a faded band would fade with it, since it sits inside the scroll content (reasoned, not seen). Released in 0.15.0.

## Bug fixes (2026-10-15)

Three fixes from the 2026-10-08 fleet audit's follow-ups, found while checking Snake for release. None is published yet.

- **A failed shared read could wipe the roster for every app.** `loadSharedProfiles` resolved to `[]` for a failed read as well as for an empty roster, and both consumers trusted it. `useSharedProfilesSync` handed that `[]` to `onRemoteChange` on a foreground resume, so the app emptied its roster (and `pruneToRoster` cleared both seats), and the app's next profile create then saved a one-profile roster over the shared store, deleting every other profile in every app. `resolveInitialProfiles` did the same at launch: a failed read looked empty, so it seeded the shared store with this app's local snapshot. New `readSharedProfiles` resolves to `null` for a failed read (the native call threw, the blob is corrupt or not an array, or every entry in it is invalid) and `[]` only when nothing has been shared. `useSharedProfilesSync` skips `onRemoteChange` on `null`, and `resolveInitialProfiles` returns `localFallback` without writing. `loadSharedProfiles` keeps its old contract for apps that call it directly (ArcheryDuel, HexFleet, Minesweeper and others); those need to move to `readSharedProfiles` themselves.
- **One profile could be on both seats.** `select` set a seat without looking at the others, and a picker's `takenProfileId` only hides the other seat's profile while both seats are on screen, so a 1 Player pick of seat 2's saved profile left both seats on it, and every later 2 Player round recorded a win and a loss for that one profile. `select` now swaps (the other seat takes this seat's previous pick, or guest), the same rule as `@tastic/input`'s `assignSeatScheme`, and REHYDRATE drops a duplicate saved before this, keeping the first seat's. Seats are compared as strings, since `Object.keys` turns a numeric seat into one. A host should reset a profile color override for both seats when a pick swaps.
- **Two seats could resolve to the same color** (audit F042). New `avoidSeatColorClash(p1Color, p2Color, [p1Default, p2Default])`: on a clash, seat 2 shows seat 1's default, or seat 2's default if seat 1 is already on it. LightCycles' lobby rule, which Snake copied locally on 2026-10-14. Display only, not persisted.
- Tests: `sharedProfileStore.test.ts` (`readSharedProfiles`' empty vs failed cases), `useSharedProfilesSync.test.ts` and `resolveInitialProfiles.test.ts` (their store mocks are now `readSharedProfiles`; a failed read skips the callback / the write), `profileSelectionSlice.test.ts` (swap with numeric, string and three seats, guest, an already-duplicated state, REHYDRATE dedupe) and the new `seatColorClash.test.ts`.
- New exports: `readSharedProfiles`, `avoidSeatColorClash`. The `select` swap changes behavior for existing callers, so this wants a minor release. Version bump is Jay's.

## Bug fixes (2026-09-18)

**`createProfileSelectionSlice` had the same missing-`REHYDRATE` bug as its sibling `createSeatColorsSlice` - found in a fleet-wide follow-up scan the day after that fix landed, in the very same package.** Fixed the same way: added a `mountKey = 'profileSelection'` parameter (defaulting to the literal key all 5 apps already mount this reducer under - confirmed by reading each app's `store.ts`) and a `REHYDRATE` case backfilling `{ ...defaultState, ...state, ...persisted }`. `mountKey` is a genuinely separate concept from this factory's `namespace` parameter (the app's own name, e.g. `'airhockey'`, used only to prefix action types) - unlike `@rific/core`'s `createSettingsSlice`, where the equivalent two concepts happen to always be the same string, so no extra parameter was needed there. 2 new tests added to `src/__tests__/profileSelectionSlice.test.ts`. Now `0.5.1` (patch, no API change - the new `mountKey` param is optional and defaults to the existing behavior).

## Bug fixes (2026-09-17)

**`createSeatColorsSlice`'s reducer had no `REHYDRATE` handling - a real crash-on-upgrade bug for any consumer using `redux-persist`.** `redux-persist`'s default `autoMergeLevel1` stateReconciler HARD-REPLACES a slice's entire persisted sub-state on rehydration rather than backfilling missing fields - confirmed against its actual installed source (`newState[key] = inboundState[key]`, not a merge). So a device with a blob persisted before `profileOverride` existed (the field added alongside this factory's own extraction) would rehydrate with `state.profileOverride === undefined`, and every consumer indexes into it (`profileOverride[seat]`) with no fallback - a real `undefined` read, not just a type-checker gap. Fixed by matching `action.type === 'persist/REHYDRATE'` (inlined as a literal string rather than taking a new `redux-persist` dependency just for the constant - this factory otherwise has no opinion on whether a consumer even uses `redux-persist`) and returning `{ ...defaultState, ...state, ...persisted }`, backfilling exactly the gap. Same pattern Snake's own hand-rolled `gameSlice.ts` already uses for its equivalent, non-factory fields. 4 new tests added to `src/__tests__/seatColorsSlice.test.ts` covering the rehydrate-with-missing-field case. Now `0.5.0` (minor - `createSeatColorsSlice`/`createProfileSelectionSlice` are both new exports this pass).

## Code Style

Enforced by ESLint + Prettier, run `npm run lint` before finishing any task.

**Prettier config:**
- Single quotes, JSX single quotes
- No semicolons
- No trailing commas
- Print width: 1000 (effectively disabled)

**ESLint rules (warnings unless noted):**
- `simple-import-sort` - imports and exports must be sorted
- `react-native/no-inline-styles` - no inline style objects
- `react-native/no-unused-styles` - no unused StyleSheet entries
- `no-console` - no console statements
- `@typescript-eslint/no-unused-vars` - `varsIgnorePattern`/`argsIgnorePattern`/`caughtErrorsIgnorePattern: '^_'` (unused vars/args/caught errors prefixed `_` are allowed), inherited from the shared `/react-native` preset default - no local override
- `react-hooks/rules-of-hooks` - error, not a warning
- `react-hooks/exhaustive-deps`, `react-hooks/refs`, `react-hooks/immutability`, `react-hooks/preserve-manual-memoization`, `react-hooks/set-state-in-effect`
- `package-json/order-properties`, `package-json/sort-collections` - on `package.json` itself
- `no-restricted-imports` - error: the bare `'@tastic/hud'` specifier (local, in `eslint.config.cjs`; import from `'@tastic/hud/chrome'`, see "hud's chrome entry" above)

`src/__mocks__/**` is excluded from linting (see `eslint.config.cjs`'s own comment) - `tsconfig.json` excludes it too, so the type-aware parser can't resolve those files in-project.

`tsconfig.json` is `extends: "@infinitetoken/tsconfig/react-native"` with `include: ["src"]` and
`exclude: ["src/__mocks__"]`, no other local compiler-option overrides. `tsup.config.cjs` is
`require('@infinitetoken/tsconfig/tsup/lib')()` (target `es2020`, CJS + ESM + `.d.ts`/`.d.mts`,
matching `package.json`'s single `"."` `exports` entry).
