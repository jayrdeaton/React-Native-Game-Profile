import { useAutoPaperTheme } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import { ConfirmDialog } from '@tastic/hud/chrome'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, Text } from 'react-native-paper'

import { OnlineError, type OnlinePlayers } from './onlinePlayers'
import { useOnlinePlayers } from './useOnlinePlayers'

export interface OnlineDataSectionProps {
  online: OnlinePlayers
  // What deleting does in this game, for the confirm (HexFleet: open matches count as forfeits). A plain default otherwise
  confirmMessage?: string
  // Called once every player is deleted, and with the error's message when the server couldn't be reached (a toast, say). Taken as
  // props since a settings dialog drawn through a Portal sits above a toast provider
  onDeleted?: () => void
  onError?: (message: string) => void
}

const DEFAULT_MESSAGE = "Every profile's online player on this device is deleted from the server, with its name. This can't be undone."

// Settings' ONLINE section, once a profile on this device has played online: Delete Online Data, for every profile on the device at
// once (a single profile's goes with the profile when it's deleted). Apple requires an account made in an app to be deletable in it
// (guideline 5.1.1(v)), and the anonymous player is one. The section and row look are @tastic/hud's Settings'
export function OnlineDataSection({ online, confirmMessage = DEFAULT_MESSAGE, onDeleted, onError }: OnlineDataSectionProps) {
  const { colors } = useAutoPaperTheme()
  const players = useOnlinePlayers(online)
  const [confirming, setConfirming] = useState(false)

  if (players.length === 0) return null
  const names = players.map((player) => player.name)
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

  async function remove() {
    setConfirming(false)
    try {
      await online.removeAll()
      onDeleted?.()
    } catch (err) {
      onError?.(err instanceof OnlineError ? err.message : "Couldn't delete online data")
    }
  }

  return (
    <View style={styles.section}>
      <Text variant='labelMedium' style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}>
        ONLINE
      </Text>
      <TouchableRipple onPress={() => setConfirming(true)} style={styles.row} accessibilityRole='button' accessibilityLabel={`Delete Online Data. Online as ${who}`}>
        <View style={styles.rowContent}>
          <View style={[styles.iconBadge, { backgroundColor: colors.errorContainer }]}>
            <Icon source='account-remove' size={18} color={colors.error} />
          </View>
          <View style={styles.flexShrink}>
            <Text variant='bodyLarge' style={{ color: colors.onSurface }}>
              Delete Online Data
            </Text>
            <Text variant='bodySmall' numberOfLines={1} style={{ color: colors.onSurfaceVariant }}>
              Online as {who}
            </Text>
          </View>
        </View>
      </TouchableRipple>
      <ConfirmDialog visible={confirming} title='Delete Online Data?' message={confirmMessage} confirmLabel='Delete' cancelLabel='Keep' icon='account-remove' destructive onConfirm={() => void remove()} onCancel={() => setConfirming(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  iconBadge: { alignItems: 'center', borderRadius: 10, height: 36, justifyContent: 'center', width: 36 },
  row: { borderRadius: 12, overflow: 'hidden', paddingVertical: 10 },
  rowContent: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  section: { gap: 12 },
  sectionLabel: { letterSpacing: 2 }
})
