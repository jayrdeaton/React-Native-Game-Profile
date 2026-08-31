import { Profile } from './types'

export const MAX_PROFILE_NAME_LENGTH = 20
// In code points, not JS string length — a single emoji can span more than one UTF-16 code unit
// (surrogate pairs, variation selectors), which .length would overcount.
export const MAX_TAG_LENGTH = 3

function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

// Codepoint 0xFE0F is the variation selector that forces an emoji-style rendering of an otherwise
// dual-purpose glyph; 0x200D is the zero-width joiner that chains multiple pictographs into one
// compound emoji (a family, a flag, a skin-tone variant) — built from String.fromCodePoint rather
// than embedded directly in a regex literal so this file's own source has no invisible characters
// in it.
const VARIATION_SELECTOR = String.fromCodePoint(0xfe0f)
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d)
// Matches one emoji as a single unit, including a ZWJ-joined compound — good enough for telling
// "the user typed an emoji" from "the user typed letters" without needing full Unicode grapheme
// segmentation (Intl.Segmenter's own Hermes support is inconsistent enough not to lean on here).
const EMOJI_PATTERN = new RegExp(`^\\p{Extended_Pictographic}${VARIATION_SELECTOR}?(${ZERO_WIDTH_JOINER}\\p{Extended_Pictographic}${VARIATION_SELECTOR}?)*$`, 'u')

// Presence check, not the full anchored EMOJI_PATTERN above — clampTag below only needs to know
// whether a just-typed chunk contains a pictograph at all, not whether an entire value is exactly
// one (possibly ZWJ-joined) emoji. Same distinction @tastic/hud's InlineColorPicker draws for its
// own font-sizing check.
const EMOJI_PRESENT = /\p{Extended_Pictographic}/u

// Empty is valid too — a profile can have no tag yet, same as it can go without ever entering an
// editor's own tag field at all; every place this renders falls back to a generic icon in that case
// (see ProfileChip).
export function isValidTag(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length === 0) return true
  if (EMOJI_PATTERN.test(value)) return true
  return !EMOJI_PRESENT.test(value) && Array.from(value).length <= MAX_TAG_LENGTH
}

// Clamps a tag field's live value on every keystroke so it's never possible to type your way into
// a state isValidTag would reject, rather than allowing it and only catching it later (a toast on
// save, or a swatch preview that overflows/truncates). `previous` is the value before this
// keystroke, `next` is what the field reports after it.
export function clampTag(previous: string, next: string): string {
  const previousCodepoints = Array.from(previous)
  const nextCodepoints = Array.from(next)

  // Shrinking (backspace/delete, or a selectTextOnFocus-driven wholesale replacement — see
  // ProfilesManager's own EditRow — reporting its own replacement text as no longer than what it
  // overwrote) always passes through untouched: there's nothing to clamp about removing content.
  if (nextCodepoints.length <= previousCodepoints.length) return next

  let sharedPrefixLength = 0
  while (sharedPrefixLength < previousCodepoints.length && previousCodepoints[sharedPrefixLength] === nextCodepoints[sharedPrefixLength]) sharedPrefixLength++
  const added = nextCodepoints.slice(sharedPrefixLength).join('')

  // A tag is either a handful of plain characters or exactly one emoji, never a mix — typing more
  // of either kind on top of the other one starts fresh with just what's newly typed, rather than
  // producing a combination isValidTag would reject anyway (an emoji followed by letters, or a
  // second emoji tacked onto the first).
  if (EMOJI_PRESENT.test(added) || EMOJI_PRESENT.test(previous)) return added

  return nextCodepoints.length > MAX_TAG_LENGTH ? previous : next
}

// Validates only the fields this package's own `Profile` type declares — an app that extends
// Profile with its own fields (a control scheme, anything else) needs its own wrapper that runs
// this first and then checks its own additions, same as it extends the type itself. See this
// package's own README for the composition pattern.
export function isValidProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<Profile>
  return typeof v.id === 'string' && v.id.length > 0 && typeof v.name === 'string' && v.name.trim().length > 0 && v.name.length <= MAX_PROFILE_NAME_LENGTH && isValidHexColor(v.color) && isValidTag(v.tag) && typeof v.createdAt === 'number' && typeof v.updatedAt === 'number'
}
