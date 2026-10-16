# TODO

Follow-ups from the 2026-10-15 fixes (see CLAUDE.md, "Bug fixes (2026-10-15)"). Line numbers are as of that date.

## Shared roster

1. **A partly invalid roster can still lose profiles.** `readSharedProfiles` drops entries that fail this version's `isValidProfile` and only treats an all-invalid roster as a failed read. If a newer app saves a profile an older app's validator rejects (a tag rule loosened later, say), the older app drops it from its roster, and its next save writes the roster back without it, deleting it for every app. Options: keep the rejected entries and pass them through on save, or make saves merge by id instead of replacing the whole blob.

## React Native 0.88 strict types

Deferred 2026-10-16 so the focus games could ship on Expo SDK 58 the same day: `@infinitetoken/tsconfig` 0.6 resolves React Native 0.88's legacy (pre-strict) types, and React Native removes those after 0.88. Apps type-check this package's source, and under the strict types it fails in 3 places (measured from an SDK 58 app with `customConditions: ["react-native"]` only): `src/PickerMenu.tsx:171` (TS2322, the trigger's ref; it was `src/ProfilePicker.tsx:164` until that code moved on 2026-10-17), `src/ProfilesManager.tsx:384` (TS2322), `src/ProfilesManager.tsx:386` (TS2322). This repo's `tsconfig.json` sets its own `customConditions`, so it lists `react-native-legacy-deep-imports` itself (2026-10-17: with `[]` it dropped the preset's and type-checked against the strict types, failing on these three). Mostly ref and event types moving to the strict instance types. Fix and release before the fleet moves past SDK 58 (see TSConfig's TODO.md).
