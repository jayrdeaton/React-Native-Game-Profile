import { getContrastColor } from '@rific/auto-paper'
import { StyleSheet, View } from 'react-native'
import { Icon, Text } from 'react-native-paper'

// Presence check, not isValidTag's own full-string emoji validation (profilesValidation.ts) - this
// only decides a font-size ratio, so it doesn't need that check's ZWJ/variation-selector precision,
// just "does this tag contain a pictograph at all."
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u

interface Props {
  // The color drawn, exactly as given (no ProfileColorProvider transform: the caller has already
  // decided what is drawn).
  color: string
  // Shown when non-empty, else `icon`.
  tag?: string
  icon: string
  size: number
  // See ProfileChip's `filled`.
  filled?: boolean
}

// A filled circle with a tag (or an icon) in a contrast-safe color on top: the drawing behind
// ProfileChip (a profile's own colors) and ProfilePicker's chip trigger (the live color in effect,
// which may not be any profile's saved one).
export function IdentityChip({ color, tag, icon, size, filled = true }: Props) {
  const contrastColor = getContrastColor(color)
  // An emoji glyph reads visually smaller than a bold letter at the same fontSize (the system emoji
  // font leaves more of its own em-box empty), so a plain-text ratio that looks right for "J" still
  // looks small for "🎮" at the identical size - this bumps emoji up to the icon's own ratio instead,
  // since a single emoji is closer in visual weight to an icon glyph than to a line of text.
  //
  // Three letters don't fit across the circle at 0.4 in a wide bold face (DAD in Solitaire's DejaVu
  // Serif Bold is a whole chip wide), and the web build ignores adjustsFontSizeToFit, so it cut
  // them off there ("D..."); 0.32 fits them, with adjustsFontSizeToFit still the backstop on native.
  const tagFontSize = size * (tag && EMOJI_PATTERN.test(tag) ? 0.6 : tag && Array.from(tag).length >= 3 ? 0.32 : 0.4)
  return (
    <View style={[styles.chip, { borderRadius: size / 2, height: size, width: size }, filled && { backgroundColor: color }]}>
      {tag ? (
        <Text style={[styles.tag, { color: contrastColor, fontSize: tagFontSize }]} numberOfLines={1} adjustsFontSizeToFit>
          {tag}
        </Text>
      ) : (
        <Icon source={icon} size={size * 0.6} color={contrastColor} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  tag: {
    fontWeight: '700',
    paddingHorizontal: 2
  }
})
