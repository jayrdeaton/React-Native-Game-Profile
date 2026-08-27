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

## Install (local dev via yalc)

Not published to the public npm registry yet.

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
(`InlineColorPicker`, `PopoverBody`, `PopoverHost`, `useAutoAlign`, `usePopoverHost`) — none of these
are bundled, so use whatever versions your app already has.
