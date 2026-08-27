import { getContrastColor } from '@rific/auto-paper'
import { StyleSheet, View } from 'react-native'
import { Icon, Text } from 'react-native-paper'

import { Profile } from './types'

// Presence check, not isValidTag's own full-string emoji validation (profilesValidation.ts) — this
// only decides a font-size ratio, so it doesn't need that check's ZWJ/variation-selector precision,
// just "does this tag contain a pictograph at all."
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u

interface Props {
  profile: Profile
  size?: number
  // False on a selected row, whose own background already fills with the profile's color (see
  // ProfilePicker's own selected-row handling) — a second circle behind the tag there would either
  // double up decoratively or, filled some other flat color, look like a stray badge next to the
  // plain icon+text every other selected row in the app uses. Contrast is still computed against
  // the profile's own color either way (that's what's actually behind the glyph whether this chip
  // paints it itself or the row already has), and the chip keeps the same size/shape footprint
  // filled or not, so a row's tag/icon stays lined up with every other row in the list regardless
  // of which one happens to be selected.
  filled?: boolean
}

// A profile's identity at a glance — its own color as a filled circle, with its tag (or a generic
// fallback icon, for a profile with none set) in a contrast-safe color on top. The same combination
// @tastic/hud's InlineColorPicker trigger shows for live color selection, just as a small static
// badge for a list row (ProfilePicker's dropdown, ProfilesManager's roster) rather than an
// interactive picker trigger.
export function ProfileChip({ profile, size = 22, filled = true }: Props) {
  const contrastColor = getContrastColor(profile.color)
  // An emoji glyph reads visually smaller than a bold letter at the same fontSize (the system emoji
  // font leaves more of its own em-box empty), so a plain-text ratio that looks right for "J" still
  // looks small for "🎮" at the identical size — this bumps emoji up to the icon's own ratio instead,
  // since a single emoji is closer in visual weight to an icon glyph than to a line of text.
  const tagFontSize = size * (profile.tag && EMOJI_PATTERN.test(profile.tag) ? 0.6 : 0.4)
  return (
    <View style={[styles.chip, { borderRadius: size / 2, height: size, width: size }, filled && { backgroundColor: profile.color }]}>
      {profile.tag ? (
        <Text style={[styles.tag, { color: contrastColor, fontSize: tagFontSize }]} numberOfLines={1} adjustsFontSizeToFit>
          {profile.tag}
        </Text>
      ) : (
        <Icon source='account' size={size * 0.6} color={contrastColor} />
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
