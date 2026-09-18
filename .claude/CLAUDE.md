# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

# @tastic/profile

Player profile identity for local-multiplayer React Native games — a saved name/color/tag a player selects per seat, with a selection popover, an inline-editable roster screen, and a reusable identity badge. Deliberately blind to any app-specific fields (control scheme, stats, anything else keyed by profile id) — a host app extends the base `Profile` type and layers those on its own side.

Part of the `@tastic`/`@rific` package ecosystem. Published at https://www.npmjs.com/package/@tastic/profile.

## Commands

```bash
npm run build        # tsup, outputs CJS + ESM + types to dist/
npm run build:watch  # tsup --watch
npm run lint         # ESLint
npm run fix          # ESLint --fix
npm test             # Jest (135 tests)
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
  sharedProfileStore.ts     - optional cross-app roster via a native iOS App Group; lazily/optionally resolves expo-modules-core's TasticProfile native module, degrades to unavailable (empty reads, no-op writes) everywhere else
  redux/                    - optional Redux-shaped state helpers; no dependency on redux/react-redux, a host app plugs these into its own store
    createActionCreator.ts    - internal `{ type, match }` action-creator factory shared by the slices below; not exported from index.ts
    profilesSlice.ts          - profilesActions (add/update/remove/setAll) + profilesReducer over Profile[], plus createProfileRecord(input) to mint a new Profile
    profileExtensionSlice.ts  - createProfileExtensionSlice<TExtension>(namespace) factory: a host app's own per-profile fields (control scheme, key scheme, ...) as a namespaced Record<profileId, TExtension> slice
    profileSelectionSlice.ts  - createProfileSelectionSlice<TSeat>(namespace, defaultState) factory: which profile each seat last picked (always local, per-device — never the shared roster), generalizing an identical hand-rolled Record<Seat, string | null> reducer 5 @tastic games each carried separately
    seatColorsSlice.ts        - createSeatColorsSlice<TSeat>(namespace, defaultState, mountKey?) factory: a seat's remembered guest color, CPU color, and a manual-recolor override for a profile-selected seat, generalizing an identical hand-rolled slice 4 @tastic games each carried separately (Snake keeps its equivalent fields folded into its own gameSlice.ts instead — a deliberate scope call, not an oversight, see the file's own doc comment)
    resolveInitialProfiles.ts - one-time initial-roster decision: local fallback when the shared store is unavailable/empty, otherwise shared always wins
    useSharedProfilesSync.ts  - keeps a Redux-backed roster in sync with the shared store: syncToShared() mirrors writes out, an AppState listener refreshes on foreground
  ProfileChip.tsx           - a profile's identity at a glance: filled color circle + tag (or fallback account icon) in a contrast-safe color
  ProfilePicker.tsx         - name trigger + selection popover; generic over an app's own richer Profile type; selection-only (no create/rename/delete)
  ProfilesManager.tsx       - the roster screen: create/rename/recolor/retag/delete inline in the tapped row, with a destructive-delete confirmation card; no navigation of its own
  ProfilesScreen.tsx        - routed screen shell wrapping ProfilesManager: container View + theme-derived bg/fg + back button + commit-pending-edit-before-navigate composition, folding in what every fleet app used to hand-roll around ProfilesManager itself (see "Profiles screen extraction" below)
  __mocks__/
    react-native.ts         - jest mock: StyleSheet, Platform, Appearance, View/ScrollView/Pressable/useWindowDimensions stubs
    react-native-paper.ts   - jest mock: Icon/IconButton/Text stubs
  __tests__/
    ProfileChip.test.tsx
    ProfilePicker.test.tsx
    ProfilesManager.test.tsx
    ProfilesScreen.test.tsx
    profileExtensionSlice.test.ts
    profilesSlice.test.ts
    profilesValidation.test.ts
    resolveInitialProfiles.test.ts
    sharedProfileStore.test.ts
    useSharedProfilesSync.test.ts
ios/
  TasticProfileModule.swift - Expo Module (`TasticProfile`) wrapping UserDefaults(suiteName:) as a generic group/key JSON bridge; apple-only per expo-module.config.json
  TasticProfile.podspec
```

## Public API

From `src/index.ts`:

- `ProfileChip` — identity badge component (`profile`, `size?`, `filled?`)
- `ProfilePicker` — generic selection-popover component (see Architecture above)
- `ProfilesManager`, `ProfilesManagerProps`, `ProfilesManagerHandle`, `ProfileEditPatch` — roster management screen; accepts `ref` (React 19 ref-as-prop, no `forwardRef`) exposing `commitPendingEdit()` — a host whose router doesn't genuinely unmount this component on "back" (React Navigation's web renderer keeps popped screens mounted-but-hidden, unlike native) must call this explicitly from its own back-button handler, or a pending edit is silently lost there. The existing unmount-effect fallback still covers every host where navigating away really does unmount (native, hardware back/swipe-back bypassing a custom back button). `ProfileEditPatch` (`name`/`color`/`tag`) is the shape `onCreate`/`onSave` both take — was a private, unexported interface inside `ProfilesManager.tsx` until the `ProfilesScreen` extraction below needed to reference it publicly from `ProfilesScreenProps`'s own `onCreate`/`onSave`, surfacing a small pre-existing gap in this package's public surface rather than adding new API for its own sake.
- `ProfilesScreen`, `ProfilesScreenProps` — routed profiles-roster screen shell wrapping `ProfilesManager` (see "Profiles screen extraction (2026-09-18)" below for what it owns and why); stays props-in/callbacks-out like `ProfilesManager` itself, never calling a host's own `useProfiles()`/`useGameStats()`-shaped hooks internally, since those hooks' shapes are genuinely per-app
- `isValidProfile`, `isValidTag`, `MAX_PROFILE_NAME_LENGTH`, `MAX_TAG_LENGTH` — validation
- `isSharedProfileStoreAvailable`, `loadSharedProfiles`, `saveSharedProfiles` — optional native App Group shared store
- `profilesActions`, `profilesReducer`, `createProfileRecord`, `CreateProfileInput`, `UpdateProfilePayload` — base roster as a Redux reducer (add/update/remove/setAll) plus a helper to mint a new `Profile`
- `createProfileExtensionSlice`, `ProfileExtensionActions`, `ProfileExtensionSlice`, `ProfileExtensionState`, `SetProfileExtensionPayload` — factory for a host app's own namespaced per-profile-id extension slice
- `resolveInitialProfiles` — one-time initial-roster resolution against the shared store
- `useSharedProfilesSync`, `UseSharedProfilesSyncOptions`, `UseSharedProfilesSyncResult` — keeps a Redux-backed roster synced with the shared store over the app's lifetime
- `createProfileSelectionSlice`, `ProfileSelectionActions`, `ProfileSelectionSlice`, `ProfileSelectionState`, `SelectProfilePayload` — factory for a host app's own per-seat "which profile is selected here" slice
- `createSeatColorsSlice`, `SeatColorsActions`, `SeatColorsSlice`, `SeatColorsState`, `SetLastGuestColorPayload`, `SetProfileOverridePayload` — factory for a host app's own per-seat remembered-color slice (guest color, CPU color, profile-override)
- `Profile` (type only) — the base identity shape

## Peer Dependencies

- `react` >=19.0.0, `react-native` >=0.76.0, `react-native-paper` >=5.0.0, `react-native-safe-area-context` >=4.0.0 — required
- `@rific/auto-paper` >=0.9.0 (`getContrastColor`, `useAutoPaperTheme`) — required
- `@rific/feedback-press` >=0.10.0 (`TouchableRipple`) — required
- `@rific/focus-chain` >=0.4.0 (`useFocusChain`) — required
- `@rific/toaster` >=0.4.0 (`useToast`) — required
- `@tastic/core` >=0.1.0 — required
- `@tastic/hud` >=0.1.3 (`InlineColorPicker`, `PopoverBody`, `PopoverHost`, `useAutoAlign`, `usePopoverHost`) — required
- `expo-modules-core` >=1.0.0 — optional (`peerDependenciesMeta`); only used by `sharedProfileStore.ts`'s App Group bridge, guarded by `try { require(...) }`, so it's safe to omit entirely on Android/web-only consumers

## Testing

- Framework: Jest (`@infinitetoken/jest-config/react-native`), jsdom environment
- Mocks in `src/__mocks__/` for `react-native`, `react-native-paper`
- 135 tests across 9 suites
- Coverage (measured 2026-09-15): **100 / 94.44 / 98.41 / 100** (statements/branches/functions/lines),
  against the shared preset's 70% floor on all four metrics — no local `coverageThreshold` override.
  Branch gaps are in `ProfilesManager.tsx` (lines 88, 108-115, 208-235); the one function gap is
  `useSharedProfilesSync.ts`'s no-op `.catch()` handler on `saveSharedProfiles`, never exercised
  because no test makes that write actually reject
- No local `jest.config.cjs` overrides beyond `moduleNameMapper` for the two `__mocks__/` entries —
  `@infinitetoken/jest-config@0.2.1`'s `/react-native` preset defaults
  `testEnvironmentOptions.customExportConditions: []` itself, needed here since `@tastic/hud` (imported
  for real, unmocked, in `ProfilePicker.tsx`/`ProfilesManager.tsx`) has the same `"browser"` exports
  condition pointing at raw `src/index.ts` that broke `@tastic/core` consumers before the fix

## Profiles screen extraction (2026-09-18)

**`ProfilesScreen` (`src/ProfilesScreen.tsx`) is a new export wrapping `ProfilesManager` with the routed-screen shell every one of the fleet's 5 apps (Snake, AirHockey, BoxHockey, Pong, LightCycles) was hand-rolling separately in its own `app/profiles.tsx`.** Snake/AirHockey/Pong's copies were verified byte-identical (diffed with comment lines stripped) before this landed; BoxHockey and LightCycles diverged in exactly two load-bearing, pre-existing ways that `ProfilesScreenProps` was shaped around rather than papered over (see below). Lives next to `ProfilesManager` rather than moving into `@tastic/hud` — it has zero generic/non-profile UI content, so it's one layer up from `ProfilesManager`, not a different kind of component.

- **What moved in from every app's hand-rolled version:** the container `View`, theme-derived bg/fg (the same literal black/white-by-appearance formula `ProfilesManager` already defaults to), a `headerLeft` back button (`@rific/feedback-press`'s `IconButton`, `icon='arrow-left'`, `accessibilityLabel='Back'`), and the `managerRef.current?.commitPendingEdit(); onBack()` two-line composition every app's own `handleBack` used to write out by hand. `ProfilesScreen` owns the `ProfilesManagerHandle` ref itself now — there's no `ref` prop on `ProfilesScreen`, since nothing outside it needs one any more: it's the one thing that both renders `ProfilesManager` and owns the only navigation trigger next to it.
- **`onCreate`/`onSave`/`onDelete` stay `ProfileEditPatch`-shaped, deliberately not widened to a host's own richer `CreateProfileInput`** — same reasoning as `ProfilesManager`'s identical props. A host whose profile shape has extra required fields composes them in its own closure at the call site (BoxHockey: `(patch) => createProfile({ ...patch, controlScheme: NEW_PROFILE_CONTROL_SCHEME })`; LightCycles: the same shape for `keyScheme`), exactly as it already did calling `<ProfilesManager>` directly. That's what let 3 of the 5 apps adopt `ProfilesScreen` with a one-line `onCreate` and the other 2 need no more adaptation than they already had — including LightCycles' own `defaultColor` divergence (its local `DEFAULT_P1_COLOR` constant instead of `@rific/auto-paper`'s `defaultColors[0].value`), which `defaultColor` staying a plain required string (never defaulted internally) keeps working unchanged.
- **`ProfileEditPatch` is now exported** — see its own Public API entry above. It was `ProfilesManager.tsx`-private until `ProfilesScreenProps.onCreate`/`onSave` needed to reference it publicly; exporting it was a one-line, pre-existing gap this extraction surfaced rather than new API invented for its own sake.
- **This subsumes and replaces the separate, never-built 'profiles-handleback' hook design** (a standalone `useCommitAndBack`-style hook that would have wrapped the same commit-then-navigate composition). Grepping every app's `game.tsx` back-button wiring confirmed that composition has no call site anywhere outside `app/profiles.tsx` — `game.tsx`'s own back buttons are a structurally different, unrelated chip-style button with no `ProfilesManagerHandle` involved at all. With `ProfilesScreen` now folding in its only real call site directly, a standalone hook built separately would have shipped with zero remaining consumers.
- `titleVariant`'s `MD3TextVariant` union is a second, separately-declared copy of `ProfilesManager.tsx`'s own local type alias (react-native-paper's MD3 Text variant names, not exported from its public entry point) rather than one shared between the two files — same call `ProfilesManager.tsx` already makes for why it's inlined instead of imported from react-native-paper's internals.
- `src/__tests__/ProfilesScreen.test.tsx` mirrors `ProfilesManager.test.tsx`'s own structure but mocks `ProfilesManager` down to `jest.fn(() => null)` (same convention `ProfilePicker.test.tsx` uses for its sibling `ProfileChip`) — it only asserts `ProfilesScreen`'s own wiring (props/callbacks pass through unchanged, `headerLeft` is a labeled back-arrow `IconButton`, and the back button calls `commitPendingEdit` before `onBack` via `invocationCallOrder`, with a no-handle-attached-yet case covered too), not `ProfilesManager`'s own rendering.
- Now `0.6.0` (minor — `ProfilesScreen`/`ProfilesScreenProps` and the newly-exported `ProfileEditPatch` are new/newly-public surface, no breaking change to anything existing).

## Bug fixes (2026-09-18)

**`createProfileSelectionSlice` had the same missing-`REHYDRATE` bug as its sibling `createSeatColorsSlice` — found in a fleet-wide follow-up scan the day after that fix landed, in the very same package.** Fixed the same way: added a `mountKey = 'profileSelection'` parameter (defaulting to the literal key all 5 apps already mount this reducer under — confirmed by reading each app's `store.ts`) and a `REHYDRATE` case backfilling `{ ...defaultState, ...state, ...persisted }`. `mountKey` is a genuinely separate concept from this factory's `namespace` parameter (the app's own name, e.g. `'airhockey'`, used only to prefix action types) — unlike `@rific/core`'s `createSettingsSlice`, where the equivalent two concepts happen to always be the same string, so no extra parameter was needed there. 2 new tests added to `src/__tests__/profileSelectionSlice.test.ts`. Now `0.5.1` (patch, no API change — the new `mountKey` param is optional and defaults to the existing behavior).

## Bug fixes (2026-09-17)

**`createSeatColorsSlice`'s reducer had no `REHYDRATE` handling — a real crash-on-upgrade bug for any consumer using `redux-persist`.** `redux-persist`'s default `autoMergeLevel1` stateReconciler HARD-REPLACES a slice's entire persisted sub-state on rehydration rather than backfilling missing fields — confirmed against its actual installed source (`newState[key] = inboundState[key]`, not a merge). So a device with a blob persisted before `profileOverride` existed (the field added alongside this factory's own extraction) would rehydrate with `state.profileOverride === undefined`, and every consumer indexes into it (`profileOverride[seat]`) with no fallback — a real `undefined` read, not just a type-checker gap. Fixed by matching `action.type === 'persist/REHYDRATE'` (inlined as a literal string rather than taking a new `redux-persist` dependency just for the constant — this factory otherwise has no opinion on whether a consumer even uses `redux-persist`) and returning `{ ...defaultState, ...state, ...persisted }`, backfilling exactly the gap. Same pattern Snake's own hand-rolled `gameSlice.ts` already uses for its equivalent, non-factory fields. 4 new tests added to `src/__tests__/seatColorsSlice.test.ts` covering the rehydrate-with-missing-field case. Now `0.5.0` (minor — `createSeatColorsSlice`/`createProfileSelectionSlice` are both new exports this pass).

## Code Style

Enforced by ESLint + Prettier, run `npm run lint` before finishing any task.

**Prettier config:**
- Single quotes, JSX single quotes
- No semicolons
- No trailing commas
- Print width: 1000 (effectively disabled)

**ESLint rules (warnings unless noted):**
- `simple-import-sort` — imports and exports must be sorted
- `react-native/no-inline-styles` — no inline style objects
- `react-native/no-unused-styles` — no unused StyleSheet entries
- `no-console` — no console statements
- `@typescript-eslint/no-unused-vars` — `varsIgnorePattern`/`argsIgnorePattern`/`caughtErrorsIgnorePattern: '^_'` (unused vars/args/caught errors prefixed `_` are allowed), inherited from the shared `/react-native` preset default — no local override
- `react-hooks/rules-of-hooks` — error, not a warning
- `react-hooks/exhaustive-deps`, `react-hooks/refs`, `react-hooks/immutability`, `react-hooks/preserve-manual-memoization`, `react-hooks/set-state-in-effect`
- `package-json/order-properties`, `package-json/sort-collections` — on `package.json` itself

`src/__mocks__/**` is excluded from linting (see `eslint.config.cjs`'s own comment) — `tsconfig.json` excludes it too, so the type-aware parser can't resolve those files in-project.

`tsconfig.json` is `extends: "@infinitetoken/tsconfig/react-native"` with `include: ["src"]` and
`exclude: ["src/__mocks__"]`, no other local compiler-option overrides. `tsup.config.cjs` is
`require('@infinitetoken/tsconfig/tsup/lib')()` (target `es2020`, CJS + ESM + `.d.ts`/`.d.mts`,
matching `package.json`'s single `"."` `exports` entry).
