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
    createActionCreator.ts    - internal `{ type, match }` action-creator factory shared by the two slices below; not exported from index.ts
    profilesSlice.ts          - profilesActions (add/update/remove/setAll) + profilesReducer over Profile[], plus createProfileRecord(input) to mint a new Profile
    profileExtensionSlice.ts  - createProfileExtensionSlice<TExtension>(namespace) factory: a host app's own per-profile fields (control scheme, key scheme, ...) as a namespaced Record<profileId, TExtension> slice
    resolveInitialProfiles.ts - one-time initial-roster decision: local fallback when the shared store is unavailable/empty, otherwise shared always wins
    useSharedProfilesSync.ts  - keeps a Redux-backed roster in sync with the shared store: syncToShared() mirrors writes out, an AppState listener refreshes on foreground
  ProfileChip.tsx           - a profile's identity at a glance: filled color circle + tag (or fallback account icon) in a contrast-safe color
  ProfilePicker.tsx         - name trigger + selection popover; generic over an app's own richer Profile type; selection-only (no create/rename/delete)
  ProfilesManager.tsx       - the roster screen: create/rename/recolor/retag/delete inline in the tapped row, with a destructive-delete confirmation card; no navigation of its own
  __mocks__/
    react-native.ts         - jest mock: StyleSheet, Platform, Appearance, View/ScrollView/Pressable/useWindowDimensions stubs
    react-native-paper.ts   - jest mock: Icon/IconButton/Text stubs
  __tests__/
    ProfileChip.test.tsx
    ProfilePicker.test.tsx
    ProfilesManager.test.tsx
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
- `ProfilesManager`, `ProfilesManagerProps`, `ProfilesManagerHandle` — roster management screen; accepts `ref` (React 19 ref-as-prop, no `forwardRef`) exposing `commitPendingEdit()` — a host whose router doesn't genuinely unmount this component on "back" (React Navigation's web renderer keeps popped screens mounted-but-hidden, unlike native) must call this explicitly from its own back-button handler, or a pending edit is silently lost there. The existing unmount-effect fallback still covers every host where navigating away really does unmount (native, hardware back/swipe-back bypassing a custom back button).
- `isValidProfile`, `isValidTag`, `MAX_PROFILE_NAME_LENGTH`, `MAX_TAG_LENGTH` — validation
- `isSharedProfileStoreAvailable`, `loadSharedProfiles`, `saveSharedProfiles` — optional native App Group shared store
- `profilesActions`, `profilesReducer`, `createProfileRecord`, `CreateProfileInput`, `UpdateProfilePayload` — base roster as a Redux reducer (add/update/remove/setAll) plus a helper to mint a new `Profile`
- `createProfileExtensionSlice`, `ProfileExtensionActions`, `ProfileExtensionSlice`, `ProfileExtensionState`, `SetProfileExtensionPayload` — factory for a host app's own namespaced per-profile-id extension slice
- `resolveInitialProfiles` — one-time initial-roster resolution against the shared store
- `useSharedProfilesSync`, `UseSharedProfilesSyncOptions`, `UseSharedProfilesSyncResult` — keeps a Redux-backed roster synced with the shared store over the app's lifetime
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
