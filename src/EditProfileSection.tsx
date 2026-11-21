import { useAutoPaperTheme } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import { createContext, type ReactNode, useContext } from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, Text } from 'react-native-paper'

// The text colors Edit Profile draws in (its fg and fgMuted, the host's or black/white by appearance), for a game's own sections on
// the screen (EditProfileScreen's `sections`), which sit on the host's backdrop rather than on a card.
export interface EditProfileColors {
  fg: string
  fgMuted: string
}

export const EditProfileColorsContext = createContext<EditProfileColors | null>(null)

/** Edit Profile's text colors, for a section a game draws on it. Black and white by appearance outside the screen. */
export function useEditProfileColors(): EditProfileColors {
  const { dark } = useAutoPaperTheme()
  return useContext(EditProfileColorsContext) ?? { fg: dark ? '#FFFFFF' : '#000000', fgMuted: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }
}

/** A labeled section of Edit Profile, as its own Name, Tag and Color are: for a game's sections on the screen. */
export function EditProfileSection({ label, children }: { label: string; children: ReactNode }) {
  const { fgMuted } = useEditProfileColors()
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: fgMuted }]} accessibilityRole='header'>
        {label.toUpperCase()}
      </Text>
      <View style={styles.rows}>{children}</View>
    </View>
  )
}

export interface EditProfileRowProps {
  icon: string
  label: string
  caption: string
  onPress?: () => void
  disabled?: boolean
  // The badge: on (the theme's tertiary), off (muted), or danger (a destructive row)
  tone?: 'on' | 'off' | 'danger'
  testID?: string
}

/** A row in an Edit Profile section, the Settings sheet's shape (a badge, a label over a caption) in the screen's own colors. */
export function EditProfileRow({ icon, label, caption, onPress, disabled, tone = 'on', testID }: EditProfileRowProps) {
  const { colors } = useAutoPaperTheme()
  const { fg, fgMuted } = useEditProfileColors()
  const badge = tone === 'danger' ? { bg: colors.errorContainer, ink: colors.error } : tone === 'on' ? { bg: colors.tertiaryContainer, ink: colors.tertiary } : { bg: colors.surfaceVariant, ink: colors.onSurfaceVariant }
  return (
    <TouchableRipple onPress={onPress} disabled={disabled || !onPress} style={styles.row} accessibilityRole='button' accessibilityLabel={`${label}, ${caption}`} accessibilityState={{ disabled: disabled || !onPress }} testID={testID}>
      <View style={styles.rowContent}>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Icon source={icon} size={18} color={badge.ink} />
        </View>
        <View style={styles.rowText}>
          <Text variant='bodyLarge' style={{ color: fg }}>
            {label}
          </Text>
          <Text variant='bodySmall' numberOfLines={1} style={{ color: fgMuted }}>
            {caption}
          </Text>
        </View>
      </View>
    </TouchableRipple>
  )
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', borderRadius: 10, height: 36, justifyContent: 'center', width: 36 },
  row: { borderRadius: 12, overflow: 'hidden', paddingVertical: 10 },
  rowContent: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  rowText: { flexShrink: 1 },
  // hud's Settings rows sit 4 apart
  rows: { gap: 4 },
  // EditProfile's own: a section's label 8 above its fields
  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 }
})
