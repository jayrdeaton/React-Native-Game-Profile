import { useAutoPaperTheme } from '@rific/auto-paper'
import { IconButton } from '@rific/feedback-press'
import { useRef } from 'react'
import { StyleSheet, View } from 'react-native'

import { ProfileEditPatch, ProfilesManager, ProfilesManagerHandle } from './ProfilesManager'
import { Profile } from './types'

// react-native-paper's own MD3 Text variant names — mirrored locally rather than importing its
// internal VariantProp/MD3TypescaleKey (not exported from the package's public entry point), same
// as ProfilesManager's own identical titleVariant prop does.
type MD3TextVariant = 'displayLarge' | 'displayMedium' | 'displaySmall' | 'headlineLarge' | 'headlineMedium' | 'headlineSmall' | 'titleLarge' | 'titleMedium' | 'titleSmall' | 'labelLarge' | 'labelMedium' | 'labelSmall' | 'bodyLarge' | 'bodyMedium' | 'bodySmall'

export interface ProfilesScreenProps {
  profiles: Profile[]
  // Same reasoning as ProfilesManager's own defaultColor: this component has no opinion on the
  // host's palette, so it stays required rather than defaulted. Callers already differ here today
  // (most apps pass @rific/auto-paper's defaultColors[0].value; one passes its own local
  // DEFAULT_P1_COLOR constant instead) — this prop is exactly what lets both keep working unchanged.
  defaultColor: string
  // Same ProfileEditPatch shape ProfilesManager's own onCreate/onSave already take — deliberately
  // NOT widened to accept a host's own richer CreateProfileInput. A host whose profile shape has
  // extra required fields (e.g. a control/key scheme) composes those in its own closure at the call
  // site, exactly as it already does calling <ProfilesManager> today.
  onCreate: (patch: ProfileEditPatch) => void
  onSave: (id: string, patch: ProfileEditPatch) => void
  // Irreversible, same as ProfilesManager's own onDelete — fires once, after this component's
  // internal confirmation card. If the host tracks anything else keyed by profile id (stats,
  // achievement-unlock history), clear that on its own side inside this callback, same as every
  // current app's `(id) => { deleteProfile(id); removeProfileStats(id) }`.
  onDelete: (id: string) => void
  onBack: () => void
  // Independently optional overrides, each defaulting to the same literal-black/white-by-appearance
  // formula every current caller renders with unchanged (none of them pass these today) — same
  // convention as BaseStatsScreen's and ProfilesManager's own fg/bg-shaped overrides. fg/fgMuted/
  // cardBg/titleVariant/colorPreview are forwarded straight through to the internal ProfilesManager.
  fg?: string
  fgMuted?: string
  bg?: string
  cardBg?: string
  titleVariant?: MD3TextVariant
  colorPreview?: (hex: string) => string
}

// The routed profiles-roster screen shell every app in this fleet hand-rolls around ProfilesManager
// today: the container View + theme-derived bg/fg + back button + commit-pending-edit-before-
// navigate composition. Lives here rather than in @tastic/hud since it has zero generic/non-profile
// UI content — it's one layer up from ProfilesManager, not a different kind of thing. Deliberately
// still doesn't call useProfiles()/useGameStats() (or any host-specific hook) itself — those two
// hooks' shapes are genuinely app-specific (different CreateProfileInput/GameStatsContextValue per
// app), so this stays props-in/callbacks-out, exactly like ProfilesManager itself.
export function ProfilesScreen({ profiles, defaultColor, onCreate, onSave, onDelete, onBack, fg: fgOverride, fgMuted, bg: bgOverride, cardBg, titleVariant, colorPreview }: ProfilesScreenProps) {
  const { dark } = useAutoPaperTheme()
  // Owns the ref itself — nothing outside this component ever needs it, since this is now the one
  // thing that both renders ProfilesManager AND owns the only navigation trigger next to it.
  const managerRef = useRef<ProfilesManagerHandle>(null)
  // Same literal-black/white-by-appearance formula as ProfilesManager's own fg default, resolved
  // here (rather than left to ProfilesManager) so this component's own headerLeft IconButton and
  // ProfilesManager's title always share the identical color.
  const fg = fgOverride ?? (dark ? '#FFFFFF' : '#000000')
  const bg = bgOverride ?? (dark ? '#000000' : '#FFFFFF')

  // Folds in the exact 2-line composition every app hand-rolls today: a hardware back gesture or
  // swipe-back unmounts ProfilesManager (which flushes on its own), but a host router that keeps a
  // popped screen mounted-but-hidden instead of unmounting it (expo-router's web renderer) needs
  // this explicit flush before navigating away, or an in-progress edit is silently lost.
  const handleBack = () => {
    managerRef.current?.commitPendingEdit()
    onBack()
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ProfilesManager ref={managerRef} profiles={profiles} defaultColor={defaultColor} onCreate={onCreate} onSave={onSave} onDelete={onDelete} fg={fg} fgMuted={fgMuted} cardBg={cardBg} titleVariant={titleVariant} colorPreview={colorPreview} headerLeft={<IconButton icon='arrow-left' iconColor={fg} size={24} onPress={handleBack} accessibilityLabel='Back' />} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
})
