# TODO

Follow-ups from the 2026-10-15 fixes (see CLAUDE.md, "Bug fixes (2026-10-15)"). Line numbers are as of that date.

## Shared roster

1. **A partly invalid roster can still lose profiles.** `readSharedProfiles` drops entries that fail this version's `isValidProfile` and only treats an all-invalid roster as a failed read. If a newer app saves a profile an older app's validator rejects (a tag rule loosened later, say), the older app drops it from its roster, and its next save writes the roster back without it, deleting it for every app. Options: keep the rejected entries and pass them through on save, or make saves merge by id instead of replacing the whole blob.

## React Native 0.88 strict types

Deferred 2026-10-16 so the focus games could ship on Expo SDK 58 the same day: `@infinitetoken/tsconfig` 0.6 resolves React Native 0.88's legacy (pre-strict) types, and React Native removes those after 0.88. Apps type-check this package's source, and under the strict types it fails in 3 places (measured from an SDK 58 app with `customConditions: ["react-native"]` only): `src/PickerMenu.tsx:178` (TS2322, the trigger's ref; it was `src/ProfilePicker.tsx:164` until that code moved on 2026-10-17, then line 171 until the swatch renderer's imports), `src/ProfilesManager.tsx:385` (TS2322), `src/ProfilesManager.tsx:387` (TS2322) (384 and 386 before the chrome import split, 2026-10-17). This repo's `tsconfig.json` sets its own `customConditions`, so it lists `react-native-legacy-deep-imports` itself (2026-10-17: with `[]` it dropped the preset's and type-checked against the strict types, failing on these three). Mostly ref and event types moving to the strict instance types. Fix and release before the fleet moves past SDK 58 (see TSConfig's TODO.md).

## hud 0.23.0

Added 2026-10-17 with the move to `@tastic/hud/chrome` (see CLAUDE.md, "hud's chrome entry, three-color swatches and takenIds").

1. **Refresh the lockfile once hud 0.23.0 is published.** `package.json` asks for `@tastic/hud` `^0.23.0`, but `package-lock.json` was left on 0.22.0 because 0.23.0 wasn't on npm yet, so `npm ci` (and `preversion`, which runs it) fails until `npm install` runs against the published version and the lockfile is committed. Do it before releasing this package.
2. **`ProfilesManager`'s color swatches are still flat under a `renderSwatch`.** Its edit row's color trigger and swatch grid are hud's `InlineColorPicker`, which can't read `ProfileColorProvider` (hud's chrome entry may not import this package). A `renderSwatch`-style prop on `InlineColorPicker`, passed through by `ProfilesManager`, would close it, if Hangman's Profiles screen wants the triad pies there too.
