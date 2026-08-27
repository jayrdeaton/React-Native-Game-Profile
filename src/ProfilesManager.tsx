import { useAutoPaperTheme } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import { useToast } from '@rific/toaster'
import { InlineColorPicker, PopoverHost, usePopoverHost } from '@tastic/hud'
import { ComponentRef, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput as RNTextInput, View } from 'react-native'
import { Button, Icon, Portal, Text, TextInput } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ProfileChip } from './ProfileChip'
import { isValidTag, MAX_PROFILE_NAME_LENGTH } from './profilesValidation'
import { Profile } from './types'

// Shared by the New Profile row's own dashed circle, every profile row's own ProfileChip, the edit
// row's color trigger, and its tag field — one size for every circle on this screen, rather than
// each picking its own.
const CHIP_SIZE = 40

interface ProfileEditPatch {
  name: string
  color: string
  tag: string
}

export interface ProfilesManagerProps {
  profiles: Profile[]
  // The color a brand-new profile's draft starts on — this component doesn't have (and shouldn't
  // invent) an opinion about the host app's own palette, so this is required rather than defaulted.
  defaultColor: string
  onCreate: (input: ProfileEditPatch) => void
  onSave: (id: string, patch: ProfileEditPatch) => void
  // Irreversible — this only fires after this component's own confirmation card, not on the first
  // tap. If the host app tracks anything else keyed by profile id (stats, history), clear that on
  // its own side when this fires.
  onDelete: (id: string) => void
  // Rendered inline, before the "Profiles" title, in this component's own header row — a plain
  // rendering slot, not an onBack-style callback: this component doesn't know or care that it's a
  // back button, only that the host wants something shown there. Omit to hide the slot.
  headerLeft?: ReactNode
}

type Row = { kind: 'profile'; profile: Profile } | { kind: 'new' }

// First letter of the name, uppercased — the tag's own default for as long as it hasn't been typed
// into directly (see the tagManuallySet state below). Empty name -> empty tag, same as typing
// nothing into the tag field yourself would leave it.
function deriveTag(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed[0].toUpperCase() : ''
}

// The profile roster itself — create/rename/recolor/retag/delete, editing inline right in the row
// you tapped — with no navigation of its own: just data in (`profiles`) and callbacks out, plus
// this file's own internal edit-draft state. Deliberately router-agnostic (an `onBack`-style prop
// would still assume *some* host owns navigation; this component doesn't even go that far), so any
// consuming screen just renders it as its body inside its own routed wrapper (back button, native
// push/pop transition, whatever persistence hook backs `profiles`/`onCreate`/`onSave`/`onDelete`).
export function ProfilesManager({ profiles, defaultColor, onCreate, onSave, onDelete, headerLeft }: ProfilesManagerProps) {
  const { dark, colors } = useAutoPaperTheme()
  const insets = useSafeAreaInsets()
  const { error: showErrorToast } = useToast()
  // Only one row is ever in edit mode at a time (see commitEdit, called before any new row opens),
  // so every EditRow instance can safely share this one host instead of each needing its own.
  const host = usePopoverHost()
  const fg = dark ? '#FFFFFF' : '#000000'
  const fgMuted = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
  const cardBg = dark ? '#111111' : '#F2F2F2'
  const cardBorder = dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
  // A contained neutral, not an outlined one — reads as "the other button" next to Delete's solid
  // danger fill, rather than looking unfinished/secondary beside it.
  const cancelBg = dark ? '#2A2A2A' : '#E0E0E0'
  const cancelFg = dark ? '#FFFFFF' : '#000000'

  // 'new' clears back to null once a commit resolves — there's only ever one row open at a time.
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState(defaultColor)
  const [draftTag, setDraftTag] = useState('')
  // Whether the tag has been typed into directly this session — once true, editing the name stops
  // overwriting it (see deriveTag's own doc). Starts true for an existing profile that already has
  // a tag (don't clobber a deliberate choice just because the name changed), false otherwise — a
  // brand new profile, or one that's never had a tag set at all.
  const [tagManuallySet, setTagManuallySet] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Commits whichever row is currently open, using its own latest draft state, then closes it —
  // always closes, even when there's nothing valid to save (an empty name just discards the draft
  // rather than leaving the row stuck open). This is the only way a row ever closes: submitting the
  // name field (see EditRow's own focus-chain wiring — tag submits to name, name submits this),
  // switching to a different row (see startEdit, which calls this before opening a new one), or
  // leaving the screen entirely (see the unmount effect below) — no explicit save/cancel buttons,
  // just scoped to the whole row instead of one field, since there's more than one field to touch.
  const commitEdit = useCallback(() => {
    const name = draftName.trim()
    if (editingId && name) {
      const tagValid = isValidTag(draftTag)
      // Surfaced here, not just the field's own live `error` outline — that outline disappears the
      // moment this row closes, so without this a still-invalid tag would just silently vanish
      // (saved as empty) with no explanation of why it didn't stick.
      if (draftTag && !tagValid) showErrorToast('Invalid tag', 'Use up to 3 letters or a single emoji')
      const tag = tagValid ? draftTag : ''
      if (editingId === 'new') onCreate({ color: draftColor, name, tag })
      else onSave(editingId, { color: draftColor, name, tag })
    }
    setEditingId(null)
  }, [editingId, draftName, draftColor, draftTag, onCreate, onSave, showErrorToast])

  // Flushes whatever's currently being edited if this whole screen goes away mid-edit — a hardware
  // back gesture or swipe-back can bypass a host screen's own back button (which should already
  // call commitEdit before navigating away) but still unmounts this component the same as any other
  // exit does. Reads the always-current commitEdit through a ref rather than depending on it
  // directly in the effect — one that re-ran (and re-cleaned-up) on every keystroke would commit on
  // every keystroke too, not just on a genuine unmount.
  const commitEditRef = useRef(commitEdit)
  useEffect(() => {
    commitEditRef.current = commitEdit
  })
  useEffect(() => () => commitEditRef.current(), [])

  const startEdit = useCallback(
    (target: 'new' | Profile) => {
      commitEdit()
      if (target === 'new') {
        setDraftName('')
        setDraftColor(defaultColor)
        setDraftTag('')
        setTagManuallySet(false)
      } else {
        setDraftName(target.name)
        setDraftColor(target.color)
        setDraftTag(target.tag)
        setTagManuallySet(target.tag !== '')
      }
      setEditingId(target === 'new' ? 'new' : target.id)
    },
    [commitEdit, defaultColor]
  )

  const handleNameChange = useCallback(
    (name: string) => {
      setDraftName(name)
      if (!tagManuallySet) setDraftTag(deriveTag(name))
    },
    [tagManuallySet]
  )

  const handleTagChange = useCallback((tag: string) => {
    setDraftTag(tag)
    setTagManuallySet(true)
  }, [])

  const confirmDeleteProfile = profiles.find((p) => p.id === confirmDeleteId) ?? null
  const handleConfirmDelete = useCallback(() => {
    if (confirmDeleteId) {
      onDelete(confirmDeleteId)
      if (editingId === confirmDeleteId) setEditingId(null)
    }
    setConfirmDeleteId(null)
  }, [confirmDeleteId, editingId, onDelete])

  // Alphabetical — this list has no other natural order (creation order isn't meaningful to look
  // something up by), and it's the one that actually stays usable once there are more than a
  // handful of profiles on one shared device.
  const sortedProfiles = useMemo(() => [...profiles].sort((a, b) => a.name.localeCompare(b.name)), [profiles])
  const rows: Row[] = [...sortedProfiles.map((profile): Row => ({ kind: 'profile', profile })), { kind: 'new' }]
  const tagInvalid = draftTag.length > 0 && !isValidTag(draftTag)

  return (
    <>
      <View style={[styles.header, { paddingTop: 8 + insets.top, paddingLeft: 8 + insets.left }]}>
        {headerLeft}
        <Text variant='displaySmall' style={[styles.title, { color: fg }]}>
          Profiles
        </Text>
      </View>

      {/* This screen has no keyboard-avoidance of its own on a screen this tall, so this is what
      actually keeps a focused row's own fields scrollable into view above the keyboard instead of
      stuck behind it. keyboardShouldPersistTaps='handled' on the ScrollView below is what lets
      tapping a *different* row (e.g. a color swatch, or another profile entirely) register on the
      first tap while a field elsewhere is still focused, instead of just dismissing the keyboard. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardAvoiding}>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps='handled'>
          {rows.map((row) => {
            if (row.kind === 'new') {
              if (editingId !== 'new') {
                return (
                  <TouchableRipple key='new' onPress={() => startEdit('new')} style={styles.row}>
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
              return <EditRow key='new' draftName={draftName} onNameChange={handleNameChange} draftColor={draftColor} onColorChange={setDraftColor} draftTag={draftTag} onTagChange={handleTagChange} tagInvalid={tagInvalid} onSubmit={commitEdit} autoFocus fgMuted={fgMuted} host={host} dark={dark} />
            }

            const { profile } = row
            if (editingId === profile.id) {
              return <EditRow key={profile.id} draftName={draftName} onNameChange={handleNameChange} draftColor={draftColor} onColorChange={setDraftColor} draftTag={draftTag} onTagChange={handleTagChange} tagInvalid={tagInvalid} onSubmit={commitEdit} onDelete={() => setConfirmDeleteId(profile.id)} fgMuted={fgMuted} host={host} dark={dark} />
            }

            // No delete affordance at rest — tap the row to start editing, which is the one place
            // delete shows (see EditRow): a deliberate extra step before a destructive action is
            // even reachable, not just before it's confirmed.
            return (
              <TouchableRipple key={profile.id} onPress={() => startEdit(profile)} style={styles.row}>
                <View style={styles.rowInner}>
                  <ProfileChip profile={profile} size={CHIP_SIZE} />
                  <Text variant='bodyLarge' style={[styles.rowName, { color: fg }]} numberOfLines={1}>
                    {profile.name}
                  </Text>
                </View>
              </TouchableRipple>
            )
          })}
        </ScrollView>
      </KeyboardAvoidingView>

      {confirmDeleteProfile && (
        <Portal>
          <View style={styles.overlay}>
            <View style={[styles.overlayCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Icon source='alert-outline' size={64} color={colors.danger} />
              <Text variant='headlineLarge' style={[styles.overlayTitle, { color: colors.danger }]}>
                Delete Profile?
              </Text>
              <Text variant='bodyLarge' style={[styles.overlayBody, { color: fg }]}>
                This permanently deletes {confirmDeleteProfile.name}&rsquo;s profile. This cannot be undone.
              </Text>
              {/* Contained neutral, not buttonColor={colors.primary} — colors.primary is often a
              live gameplay/seat color in host apps, so a contained Cancel in that color would just
              be whatever's currently painted there, with no relation to "safe to tap". */}
              <Button mode='contained' onPress={() => setConfirmDeleteId(null)} style={styles.overlayButton} buttonColor={cancelBg} textColor={cancelFg}>
                Cancel
              </Button>
              {/* colors.danger/onDanger — auto-paper's actual semantic role for this, not a seat's
              own live color by luck of the default palette. */}
              <Button mode='contained' onPress={handleConfirmDelete} style={styles.overlayButton} buttonColor={colors.danger} textColor={colors.onDanger}>
                Delete
              </Button>
            </View>
          </View>
        </Portal>
      )}
    </>
  )
}

interface EditRowProps {
  draftName: string
  onNameChange: (name: string) => void
  draftColor: string
  onColorChange: (color: string) => void
  draftTag: string
  onTagChange: (tag: string) => void
  tagInvalid: boolean
  onSubmit: () => void
  // Omitted for the 'new' row — nothing saved yet to delete.
  onDelete?: () => void
  autoFocus?: boolean
  fgMuted: string
  host: PopoverHost
  dark: boolean
}

// One row, expanded: the color trigger (@tastic/hud's InlineColorPicker), a tag field clamped to
// CHIP_SIZE, the name taking up whatever's
// left, and — only for an existing profile — a delete icon at the very end. No `tag` passed to the
// color trigger here — it keeps its plain palette icon regardless of the row's own tag field, since
// the tag is already right next to it in its own field, so repeating it on the color trigger too
// would be redundant rather than informative.
// Return-key chains tag -> name via explicit refs rather than each field submitting on its
// own — submitting the *name* field is what actually commits the row (see the last field's own
// onSubmitEditing override below), matching how a normal multi-field form reads: fill fields in
// order, the last one finishes it.
function EditRow({ draftName, onNameChange, draftColor, onColorChange, draftTag, onTagChange, tagInvalid, onSubmit, onDelete, autoFocus, fgMuted, host, dark }: EditRowProps) {
  const tagInputRef = useRef<ComponentRef<typeof RNTextInput>>(null)
  const nameInputRef = useRef<ComponentRef<typeof RNTextInput>>(null)

  return (
    <View style={styles.editRow}>
      <InlineColorPicker id='color' host={host} value={draftColor} onChange={onColorChange} dark={dark} />
      {/* selectTextOnFocus so tapping into an already-set tag selects it for wholesale replacement
      — the far more common edit than inserting into the middle of a 1-3 character value. */}
      <TextInput ref={tagInputRef} mode='outlined' dense value={draftTag} onChangeText={onTagChange} placeholder='Tag' autoCapitalize='characters' selectTextOnFocus error={tagInvalid} returnKeyType='next' style={styles.tagInput} contentStyle={styles.tagInputContent} onSubmitEditing={() => nameInputRef.current?.focus()} />
      <TextInput ref={nameInputRef} mode='outlined' dense value={draftName} onChangeText={onNameChange} maxLength={MAX_PROFILE_NAME_LENGTH} placeholder='Name' autoFocus={autoFocus} returnKeyType='done' style={styles.nameInput} onSubmitEditing={onSubmit} />
      {onDelete && (
        <TouchableRipple onPress={onDelete} style={styles.iconButton}>
          <Icon source='trash-can-outline' size={18} color={fgMuted} />
        </TouchableRipple>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: 4,
    paddingHorizontal: 20
  },
  editRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 8
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  keyboardAvoiding: {
    flex: 1
  },
  nameInput: {
    flex: 1
  },
  newChip: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderWidth: 2
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  overlayBody: { textAlign: 'center' },
  overlayButton: { width: 160 },
  overlayCard: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
    maxWidth: 360,
    padding: 32
  },
  overlayTitle: { fontWeight: 'bold', marginBottom: -8 },
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
  scrollView: {
    flex: 1
  },
  // Wide enough for MAX_TAG_LENGTH monospace characters (or one emoji) plus its own padding/border
  // — matched to CHIP_SIZE (the same footprint every other circle on this screen uses), not a
  // fraction of the row's width, since the name field next to it is what should actually get the
  // row's remaining space.
  tagInput: {
    height: CHIP_SIZE,
    width: CHIP_SIZE
  },
  tagInputContent: {
    // react-native-paper's outlined TextInput sets its own native input's minWidth from the
    // placeholder/label's measured layout width (sized for a real label, not this field's own
    // 3-character placeholder) — left alone, that floor is wider than CHIP_SIZE, so the actual
    // editable box silently overflows past this field's own visible outline and centers within
    // that wider, partly invisible box instead. Zeroing it here lets the input size to CHIP_SIZE
    // instead, which is what actually makes `textAlign: 'center'` below center against the
    // visible box rather than an overflowing invisible one.
    minWidth: 0,
    // Same reasoning as minWidth above, for the horizontal direction: the outlined input's own
    // default padding (16px a side) is sized for a normal-width field, and at CHIP_SIZE's 40px
    // that leaves only 8px total for actual text — not enough to fit the "Tag" placeholder itself
    // (3 characters), which is what was clipping it to just "T" once minWidth stopped letting the
    // box silently overflow wider to compensate.
    paddingHorizontal: 2,
    textAlign: 'center',
    textAlignVertical: 'center'
  },
  title: {
    flexShrink: 1,
    fontWeight: 'bold'
  }
})
