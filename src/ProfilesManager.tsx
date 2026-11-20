import { FadingScrollView, useAutoPaperTheme } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import { ReactNode, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, Text } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { NEW_PROFILE_ID } from './EditProfileScreen'
import { ProfileChip } from './ProfileChip'
import { Profile } from './types'

// Shared by the New Profile row's own dashed circle and every profile row's own ProfileChip - one
// size for every circle on this screen, rather than each picking its own.
const CHIP_SIZE = 40

// react-native-paper's own MD3 Text variant names - mirrored locally rather than importing its
// internal VariantProp/MD3TypescaleKey (not exported from the package's public entry point), same
// as @tastic/hud's BaseStatsScreen does for its own identical titleVariant prop.
type MD3TextVariant = 'displayLarge' | 'displayMedium' | 'displaySmall' | 'headlineLarge' | 'headlineMedium' | 'headlineSmall' | 'titleLarge' | 'titleMedium' | 'titleSmall' | 'labelLarge' | 'labelMedium' | 'labelSmall' | 'bodyLarge' | 'bodyMedium' | 'bodySmall'

export interface ProfilesManagerProps {
  profiles: Profile[]
  // Opens a profile's Edit Profile screen: called with its id when its row is tapped, and with
  // NEW_PROFILE_ID for New Profile. The game pushes its edit route (`/profile/<id>`), which renders
  // EditProfileScreen with that id - the same way hud's Settings takes `onShowProfiles`.
  onEdit: (profileId: string) => void
  // Rendered inline, before the "Profiles" title, in the header row - a plain rendering slot, not an
  // onBack-style callback: this component doesn't know or care that it's a back button, only that the
  // host wants something shown there. Omit to hide the slot.
  headerLeft?: ReactNode
  // The text color, black/white by appearance when omitted. Same convention as @tastic/hud's
  // BaseStatsScreen fg override, for a caller with its own chrome palette.
  fg?: string
  // 'headlineSmall' (this screen's own default, below), matching BaseStatsScreen's own settled
  // default - this title sits next to a small headerLeft back-button glyph the same way.
  titleVariant?: MD3TextVariant
}

type Row = { kind: 'profile'; profile: Profile } | { kind: 'new' }

// The profile roster: a chip and name per profile, alphabetically, New Profile last. Tapping a row
// opens that profile's Edit Profile screen through `onEdit`, which the game wires to its navigation
// (Jay, 2026-11-20: a real screen, with its own transition, address and back gestures; it was a swap
// inside this component for a few hours the same day). No navigation of its own: data in
// (`profiles`), callbacks out, so a host renders it as a routed screen's body inside its own wrapper
// (back button, persistence) - or uses ProfilesScreen, which is that wrapper.
export function ProfilesManager({ profiles, onEdit, headerLeft, fg: fgOverride, titleVariant = 'headlineSmall' }: ProfilesManagerProps) {
  const { dark } = useAutoPaperTheme()
  const insets = useSafeAreaInsets()
  const fg = fgOverride ?? (dark ? '#FFFFFF' : '#000000')

  // Alphabetical - this list has no other natural order (creation order isn't meaningful to look
  // something up by), and it's the one that actually stays usable once there are more than a
  // handful of profiles on one shared device.
  const sortedProfiles = useMemo(() => [...profiles].sort((a, b) => a.name.localeCompare(b.name)), [profiles])
  const rows: Row[] = [...sortedProfiles.map((profile): Row => ({ kind: 'profile', profile })), { kind: 'new' }]

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: 8 + insets.top, paddingLeft: 8 + insets.left }]}>
        {headerLeft}
        <Text variant={titleVariant} style={[styles.title, { color: fg }]}>
          Profiles
        </Text>
      </View>

      {/* The rows fade out at an edge while there is more past it, the same cue as the Settings
      sheet and the Achievements screen (Jay, 2026-10-16: every scrolling screen alike). */}
      <FadingScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        {rows.map((row) => {
          if (row.kind === 'new') {
            return (
              <TouchableRipple key='new' onPress={() => onEdit(NEW_PROFILE_ID)} style={styles.row} accessibilityRole='button'>
                <View style={styles.rowInner}>
                  <View style={[styles.rowChip, styles.newChip, { borderColor: fg }]}>
                    <Icon source='plus' size={20} color={fg} />
                  </View>
                  <Text variant='bodyLarge' style={{ color: fg }}>
                    New Profile
                  </Text>
                </View>
              </TouchableRipple>
            )
          }

          // No delete at rest - tap the row to open its screen, which is the one place delete
          // shows: a deliberate extra step before a destructive action is even reachable, not just
          // before it's confirmed.
          const { profile } = row
          return (
            <TouchableRipple key={profile.id} onPress={() => onEdit(profile.id)} style={styles.row} accessibilityRole='button'>
              <View style={styles.rowInner}>
                <ProfileChip profile={profile} size={CHIP_SIZE} />
                <Text variant='bodyLarge' style={[styles.rowName, { color: fg }]} numberOfLines={1}>
                  {profile.name}
                </Text>
              </View>
            </TouchableRipple>
          )
        })}
      </FadingScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: 4,
    paddingHorizontal: 20
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 8
  },
  newChip: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderWidth: 2
  },
  row: {
    borderRadius: 8,
    paddingVertical: 8
  },
  rowChip: {
    alignItems: 'center',
    borderRadius: CHIP_SIZE / 2,
    height: CHIP_SIZE,
    justifyContent: 'center',
    width: CHIP_SIZE
  },
  rowInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12
  },
  rowName: {
    flex: 1
  },
  screen: {
    flex: 1
  },
  title: {
    flexShrink: 1,
    fontWeight: 'bold'
  }
})
