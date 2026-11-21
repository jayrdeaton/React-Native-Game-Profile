import { useAutoPaperTheme } from '@rific/auto-paper'
import { useToast } from '@rific/toaster'
import { ConfirmDialog } from '@tastic/hud/chrome'
import { type ReactNode, Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { EditProfile } from './EditProfile'
import { useProfileColorPreview } from './ProfileColorContext'
import { clampTag, isValidTag } from './profilesValidation'
import { Profile } from './types'

// react-native-paper's own MD3 Text variant names - mirrored locally rather than importing its
// internal VariantProp/MD3TypescaleKey (not exported from the package's public entry point), same
// as ProfilesManager's own titleVariant prop does.
type MD3TextVariant = 'displayLarge' | 'displayMedium' | 'displaySmall' | 'headlineLarge' | 'headlineMedium' | 'headlineSmall' | 'titleLarge' | 'titleMedium' | 'titleSmall' | 'labelLarge' | 'labelMedium' | 'labelSmall' | 'bodyLarge' | 'bodyMedium' | 'bodySmall'

// The profile id that opens the screen on a new profile: what ProfilesManager's New Profile row hands
// `onEdit`, and what a game's route passes back as `profileId` (`/profile/new`).
export const NEW_PROFILE_ID = 'new'

// What onCreate/onSave are handed: the profile's own fields, as edited. A host whose profile shape has
// more required fields composes them in its own closure at the call site.
export interface ProfileEditPatch {
  name: string
  color: string
  tag: string
}

export interface EditProfileScreenHandle {
  // Saves the draft now, the same thing the screen does as it unmounts. For a host whose router keeps
  // a screen it has left mounted rather than unmounting it: call it as the screen loses focus (a back
  // gesture or the browser's back), or what was typed is never saved. Saves once: anything typed after
  // is not saved. A no-op once the screen has saved or deleted the profile.
  commitPendingEdit: () => void
}

export interface EditProfileScreenProps {
  // The profile to edit, or NEW_PROFILE_ID for a new one. An id the roster doesn't have (a stale
  // link, a profile deleted elsewhere) leaves the screen at once through onBack, saving nothing.
  profileId: string
  // The roster, read for the profile being edited. Render the screen once it has loaded: an id it
  // doesn't have yet reads as a profile that isn't there.
  profiles: Profile[]
  // The color a new profile starts on. This package has no opinion on the host's palette, so it's
  // required. One off @rific/auto-paper's palette leads the color grid, picked.
  defaultColor: string
  onCreate: (patch: ProfileEditPatch) => void
  onSave: (id: string, patch: ProfileEditPatch) => void
  // Irreversible: fires only after hud's confirmation, then onBack. If the host keeps anything else
  // by profile id (stats, history), clear it here.
  onDelete: (id: string) => void
  // Leaves the screen: called after the back arrow, Done or the tag field's Return has saved, after a
  // delete, and for an id the roster doesn't have. A swipe back or a back button that leaves without
  // it saves as the screen unmounts (or through commitPendingEdit).
  onBack: () => void
  // Text colors, black/white by appearance when omitted, and the screen's background, black/white by
  // appearance when omitted ('transparent' over a game's own backdrop), the same as ProfilesScreen's.
  fg?: string
  fgMuted?: string
  bg?: string
  titleVariant?: MD3TextVariant
  // What the screen draws for a color, its chip and every swatch. Defaults to ProfileColorProvider's
  // preview. Saved colors are untouched.
  colorPreview?: (hex: string) => string
  // A game's own sections for a saved profile, drawn under Color and above Delete Profile, in the screen's text colors
  // (EditProfileSection, EditProfileRow, useEditProfileColors): @tastic/profile/online's ProfileOnlineSection, say. Not for a new profile
  sections?: (profile: Profile) => ReactNode
  ref?: Ref<EditProfileScreenHandle>
}

// First letter of the name, uppercased - the tag's own default for as long as it hasn't been typed
// into directly (see tagTyped below). Empty name -> empty tag.
function deriveTag(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed[0].toUpperCase() : ''
}

// One profile's own screen, for a game's route to render (Jay, 2026-11-20: a real screen, with its
// own transition, address and back gestures, not a swap inside the roster): ProfilesManager's rows
// call its `onEdit(id)`, which a game turns into a push of its edit route (`/profile/<id>`), and that
// route renders this with the id. Router-agnostic like ProfilesManager: data in, callbacks out.
// The back arrow, Done and the tag field's Return save and leave (onBack); a swipe back, Android's
// back button or the browser's back leave through the router and save as the screen goes (Jay: they
// all save). An empty name saves nothing. Deleting goes through hud's destructive ConfirmDialog.
export function EditProfileScreen({ profileId, profiles, defaultColor, onCreate, onSave, onDelete, onBack, fg: fgOverride, fgMuted: fgMutedOverride, bg: bgOverride, titleVariant = 'headlineSmall', colorPreview: colorPreviewProp, sections, ref }: EditProfileScreenProps) {
  const { dark } = useAutoPaperTheme()
  const { error: showErrorToast } = useToast()
  const contextColorPreview = useProfileColorPreview()
  const colorPreview = colorPreviewProp ?? contextColorPreview
  const fg = fgOverride ?? (dark ? '#FFFFFF' : '#000000')
  const fgMuted = fgMutedOverride ?? (dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)')
  const bg = bgOverride ?? (dark ? '#000000' : '#FFFFFF')

  const isNew = profileId === NEW_PROFILE_ID
  const profile = isNew ? null : (profiles.find((p) => p.id === profileId) ?? null)
  const missing = !isNew && profile === null

  // The drafts start from the profile as the screen opens; a change made elsewhere meanwhile (another
  // app's sync) doesn't overwrite what's being typed.
  const [draftName, setDraftName] = useState(() => profile?.name ?? '')
  const [draftColor, setDraftColor] = useState(() => profile?.color ?? defaultColor)
  const [draftTag, setDraftTag] = useState(() => profile?.tag ?? '')
  // The color the profile had as the screen opened (see EditProfile's editSwatches).
  const [startColor] = useState(() => profile?.color ?? defaultColor)
  // Whether the tag has been typed into: once it has, editing the name stops overwriting it (see
  // deriveTag). Starts true for a profile that already has a tag, so a rename keeps a deliberate choice.
  const [tagTyped, setTagTyped] = useState(() => !!profile?.tag)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Set once the profile has been saved or deleted (or found missing), so nothing saves twice: Done
  // saves and leaves, and the unmount after must not save again (a new profile would be made twice).
  const finished = useRef(false)

  // Saves the draft, unless there's nothing to save: an empty name (a new profile left blank, or a
  // name cleared), or a saved profile left as it was, so opening one and going back doesn't rewrite
  // it (and the shared roster with it). Only a save that happens finishes the screen.
  const save = useCallback(() => {
    if (finished.current || missing) return
    const name = draftName.trim()
    if (!name) return
    const tagValid = isValidTag(draftTag)
    const patch = { color: draftColor, name, tag: tagValid ? draftTag : '' }
    if (profile && patch.name === profile.name && patch.color === profile.color && patch.tag === profile.tag) return
    finished.current = true
    // Only reachable through a tag loaded from storage (clampTag keeps the field from typing its way
    // into one): the field has shown it as an error, and this says why it didn't stick.
    if (draftTag && !tagValid) showErrorToast('Invalid tag', 'Use up to 3 letters or a single emoji')
    if (isNew) onCreate(patch)
    else onSave(profileId, patch)
  }, [missing, draftName, draftTag, draftColor, profile, isNew, profileId, onCreate, onSave, showErrorToast])

  // Saves as the screen goes, however it goes (a swipe back, Android's back button, the browser's
  // back): through a ref to the latest save, so the effect runs its cleanup on unmount only, not on
  // every keystroke.
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => () => saveRef.current(), [])
  useImperativeHandle(ref, () => ({ commitPendingEdit: () => saveRef.current() }), [])

  // An id the roster doesn't have: leave, once, saving nothing.
  const onBackRef = useRef(onBack)
  useEffect(() => {
    onBackRef.current = onBack
  })
  useEffect(() => {
    if (!missing || finished.current) return
    finished.current = true
    onBackRef.current()
  }, [missing])

  const handleDone = useCallback(() => {
    save()
    onBack()
  }, [save, onBack])

  const handleNameChange = useCallback(
    (name: string) => {
      setDraftName(name)
      if (!tagTyped) setDraftTag(deriveTag(name))
    },
    [tagTyped]
  )

  // The functional form, so rapid keystrokes batched into one update each clamp against the last
  // one's result rather than a stale render-time draftTag.
  const handleTagChange = useCallback((tag: string) => {
    setDraftTag((previous) => clampTag(previous, tag))
    setTagTyped(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    setConfirmingDelete(false)
    if (!profile || finished.current) return
    finished.current = true
    onDelete(profile.id)
    onBack()
  }, [profile, onDelete, onBack])

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {!missing && <EditProfile isNew={isNew} draftName={draftName} onNameChange={handleNameChange} draftTag={draftTag} onTagChange={handleTagChange} draftColor={draftColor} onColorChange={setDraftColor} startColor={startColor} onDone={handleDone} onDelete={profile ? () => setConfirmingDelete(true) : undefined} extra={profile && sections ? sections(profile) : undefined} fg={fg} fgMuted={fgMuted} titleVariant={titleVariant} colorPreview={colorPreview} />}

      {/* hud's ConfirmDialog, the one confirm card every app in the fleet uses (Jay, 2026-10-15: one
        look for every dialog), destructive. */}
      <ConfirmDialog visible={confirmingDelete && profile !== null} title='Delete Profile?' message={profile ? `This permanently deletes ${profile.name}’s profile. This cannot be undone.` : ''} confirmLabel='Delete' cancelLabel='Cancel' icon='alert-outline' destructive onConfirm={handleConfirmDelete} onCancel={() => setConfirmingDelete(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
})
