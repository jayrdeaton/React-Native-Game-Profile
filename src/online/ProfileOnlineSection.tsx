import { ConfirmDialog } from '@tastic/hud/chrome'
import { type ReactNode, useState } from 'react'

import { EditProfileRow, EditProfileSection } from '../EditProfileSection'
import { OnlineError, type OnlinePlayers, type OnlineProfile } from './onlinePlayers'
import { useOnlinePlayers } from './useOnlinePlayers'

export interface ProfileOnlineSectionProps {
  online: OnlinePlayers
  // The profile on the Edit Profile screen (EditProfileScreen's `sections` hands it)
  profile: OnlineProfile
  // What deleting does in this game, for the confirm (HexFleet: open matches count as forfeits). A plain default otherwise
  confirmMessage?: string
  // Called once the player is deleted, and with the error's message when the server couldn't be reached (a toast, say)
  onDeleted?: () => void
  onError?: (message: string) => void
  // A game's own rows for this profile's online play, above Delete Online Data (CardTastic's Show on Public Boards): EditProfileRow
  children?: ReactNode
}

// A profile's ONLINE section on its Edit Profile screen (Jay, 2026-11-20: a profile is the person online, so what's online about them
// is on their own page), once it has played online: a game's own rows, then Delete Online Data, which deletes its player from the
// server and keeps the profile. Deleting the profile deletes its player too (`sync`). Apple requires an account made in an app to be
// deletable in it (guideline 5.1.1(v)), and the anonymous player is one. Drawn with EditProfileSection and EditProfileRow, in the
// screen's own colors
export function ProfileOnlineSection({ online, profile, confirmMessage, onDeleted, onError, children }: ProfileOnlineSectionProps) {
  const players = useOnlinePlayers(online)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!players.some((player) => player.profileId === profile.id)) return null

  async function remove() {
    setConfirming(false)
    setBusy(true)
    try {
      await online.remove(profile.id)
      onDeleted?.()
    } catch (err) {
      onError?.(err instanceof OnlineError ? err.message : "Couldn't delete online data")
    } finally {
      setBusy(false)
    }
  }

  return (
    <EditProfileSection label='Online'>
      {children}
      <EditProfileRow icon='account-remove' tone='danger' label='Delete Online Data' caption='Remove online player' disabled={busy} onPress={() => setConfirming(true)} testID='profile-online-delete' />
      <ConfirmDialog visible={confirming} title='Delete Online Data?' message={confirmMessage ?? `${profile.name}'s online player is deleted from the server. The profile stays on this device. This can't be undone.`} confirmLabel='Delete' cancelLabel='Keep' icon='account-remove' destructive onConfirm={() => void remove()} onCancel={() => setConfirming(false)} />
    </EditProfileSection>
  )
}
