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

// Empty is valid too — a profile can have no tag yet, same as it can go without ever entering an
// editor's own tag field at all; every place this renders falls back to a generic icon in that case
// (see ProfileChip).
export function isValidTag(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length === 0) return true
  if (EMOJI_PATTERN.test(value)) return true
  return !/\p{Extended_Pictographic}/u.test(value) && Array.from(value).length <= MAX_TAG_LENGTH
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
