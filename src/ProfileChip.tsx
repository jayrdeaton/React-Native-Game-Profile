import { IdentityChip } from './IdentityChip'
import { useProfileDisplayColor } from './ProfileColorContext'
import { Profile } from './types'

interface Props {
  profile: Profile
  size?: number
  // False on a selected row, whose own background already fills with the profile's color (see
  // ProfilePicker's own selected-row handling) - a second circle behind the tag there would either
  // double up decoratively or, filled some other flat color, look like a stray badge next to the
  // plain icon+text every other selected row in the app uses. Contrast is still computed against
  // the profile's own color either way (that's what's actually behind the glyph whether this chip
  // paints it itself or the row already has), and the chip keeps the same size/shape footprint
  // filled or not, so a row's tag/icon stays lined up with every other row in the list regardless
  // of which one happens to be selected.
  filled?: boolean
}

// A profile's identity at a glance - its own color as a filled circle, with its tag (or a generic
// fallback icon, for a profile with none set) in a contrast-safe color on top. The same combination
// @tastic/hud's InlineColorPicker trigger shows for live color selection, just as a small static
// badge for a list row (ProfilePicker's dropdown, ProfilesManager's roster) rather than an
// interactive picker trigger.
export function ProfileChip({ profile, size = 22, filled = true }: Props) {
  // The drawn color, not necessarily the saved one - see ProfileColorProvider.
  const color = useProfileDisplayColor(profile.color)
  return <IdentityChip color={color} tag={profile.tag} icon='account' size={size} filled={filled} />
}
