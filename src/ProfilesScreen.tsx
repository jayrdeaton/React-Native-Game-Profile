import { useAutoPaperTheme } from '@rific/auto-paper'
import { IconButton } from '@rific/feedback-press'
import { StyleSheet, View } from 'react-native'

import { ProfilesManager } from './ProfilesManager'
import { Profile } from './types'

// react-native-paper's own MD3 Text variant names - mirrored locally rather than importing its
// internal VariantProp/MD3TypescaleKey (not exported from the package's public entry point), same
// as ProfilesManager's own identical titleVariant prop does.
type MD3TextVariant = 'displayLarge' | 'displayMedium' | 'displaySmall' | 'headlineLarge' | 'headlineMedium' | 'headlineSmall' | 'titleLarge' | 'titleMedium' | 'titleSmall' | 'labelLarge' | 'labelMedium' | 'labelSmall' | 'bodyLarge' | 'bodyMedium' | 'bodySmall'

export interface ProfilesScreenProps {
  profiles: Profile[]
  // ProfilesManager's: opens a profile's Edit Profile screen (a push of the game's `/profile/<id>`
  // route, which renders EditProfileScreen), with NEW_PROFILE_ID for New Profile.
  onEdit: (profileId: string) => void
  onBack: () => void
  // Independently optional overrides, each defaulting to the literal-black/white-by-appearance
  // formula - same convention as BaseStatsScreen's and ProfilesManager's own fg/bg-shaped overrides.
  // fg/titleVariant are forwarded straight through to the internal ProfilesManager.
  fg?: string
  bg?: string
  titleVariant?: MD3TextVariant
}

// The routed roster screen shell every app in this fleet used to hand-roll around ProfilesManager:
// the container View, theme-derived bg/fg and the back button. Lives here rather than in @tastic/hud
// since it has zero generic/non-profile UI content. Deliberately doesn't call useProfiles() (or any
// host-specific hook) itself - those hooks' shapes are app-specific - so it stays props-in/callbacks-
// out, exactly like ProfilesManager. Nothing is edited on this screen (EditProfileScreen is its own
// route), so the back button just leaves.
export function ProfilesScreen({ profiles, onEdit, onBack, fg: fgOverride, bg: bgOverride, titleVariant }: ProfilesScreenProps) {
  const { dark } = useAutoPaperTheme()
  // Resolved here (rather than left to ProfilesManager) so the back IconButton and ProfilesManager's
  // title always share the identical color.
  const fg = fgOverride ?? (dark ? '#FFFFFF' : '#000000')
  const bg = bgOverride ?? (dark ? '#000000' : '#FFFFFF')

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ProfilesManager profiles={profiles} onEdit={onEdit} fg={fg} titleVariant={titleVariant} headerLeft={<IconButton icon='arrow-left' iconColor={fg} size={24} onPress={onBack} accessibilityLabel='Back' />} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
})
