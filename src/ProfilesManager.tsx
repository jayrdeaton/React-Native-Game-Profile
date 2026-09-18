import { useAutoPaperTheme } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import { useFocusChain } from '@rific/focus-chain'
import { useToast } from '@rific/toaster'
import { InlineColorPicker, PopoverHost, usePopoverHost } from '@tastic/hud'
import { ReactNode, Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { Button, Icon, Portal, Text, TextInput } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ProfileChip } from './ProfileChip'
import { clampTag, isValidTag, MAX_PROFILE_NAME_LENGTH } from './profilesValidation'
import { Profile } from './types'

// Shared by the New Profile row's own dashed circle and every profile row's own ProfileChip — one
// size for every circle on this screen, rather than each picking its own.
const CHIP_SIZE = 40

// react-native-paper's own MD3 Text variant names — mirrored locally rather than importing its
// internal VariantProp/MD3TypescaleKey (not exported from the package's public entry point), same
// as @tastic/hud's BaseStatsScreen does for its own identical titleVariant prop.
type MD3TextVariant = 'displayLarge' | 'displayMedium' | 'displaySmall' | 'headlineLarge' | 'headlineMedium' | 'headlineSmall' | 'titleLarge' | 'titleMedium' | 'titleSmall' | 'labelLarge' | 'labelMedium' | 'labelSmall' | 'bodyLarge' | 'bodyMedium' | 'bodySmall'

// Exported (not just used internally) so a host composing a screen around this component — e.g.
// @tastic/profile's own ProfilesScreen — can reference this exact shape in its own onCreate/onSave
// prop types without redeclaring it.
export interface ProfileEditPatch {
  name: string
  color: string
  tag: string
}

export interface ProfilesManagerHandle {
  // Flushes whatever row is currently being edited — the same thing this component's own unmount
  // effect does, but callable explicitly. Exists because "unmount" isn't a reliable "the user is
  // navigating away" signal on every host: React Navigation's web renderer keeps a popped screen
  // mounted-but-hidden instead of unmounting it, so a host relying only on the unmount fallback
  // silently loses an in-progress edit on `router.back()` there. A host whose router doesn't
  // genuinely unmount this component on navigation should hold a ref and call this right before
  // navigating away (e.g. in its own back-button handler). Safe to call any time, including when
  // nothing is being edited — a no-op then, same as the unmount effect already is.
  commitPendingEdit: () => void
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
  // React 19 accepts `ref` as a plain prop on a function component (no forwardRef needed) — see
  // ProfilesManagerHandle's own doc for why a host may need this.
  ref?: Ref<ProfilesManagerHandle>
  // Independently optional overrides for this screen's text/card colors — each defaults to the same
  // literal-black/white-by-appearance formula as before when omitted, so every existing caller
  // (none of which pass these) renders identically to before. Same convention as @tastic/hud's
  // BaseStatsScreen fg/cardBg overrides, for a caller with its own app-wide chrome palette instead
  // of that literal black/white convention. cardBorder/cancelBg/cancelFg have no override, matching
  // BaseStatsScreen's identical reasoning for cardBorder: their low-alpha/neutral values already
  // read fine against any cardBg, and (for Cancel specifically) are deliberately neutral rather than
  // theme-derived so a host's own live gameplay/seat color can't land there by coincidence.
  fg?: string
  fgMuted?: string
  cardBg?: string
  // 'headlineSmall' (this screen's own default, below), matching BaseStatsScreen's own settled
  // default and the reasoning behind it — this title sits next to a small headerLeft back-button
  // glyph the same way, and the previous hardcoded 'displaySmall' read as oversized there too.
  titleVariant?: MD3TextVariant
  // Transforms the color swatch grid's own preview per-swatch — forwarded straight to the internal
  // InlineColorPicker's identical prop (see its own doc). Leaves draftColor/onCreate/onSave's actual
  // color value untouched; only what's rendered changes.
  colorPreview?: (hex: string) => string
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
// Staying router-agnostic means this component can't know for itself whether "navigating away"
// really unmounts it on a given host's router — see ProfilesManagerHandle's own doc for the
// react-navigation-web case where it doesn't, and why a host there needs the `ref` escape hatch
// instead of relying on the unmount fallback alone.
export function ProfilesManager({ profiles, defaultColor, onCreate, onSave, onDelete, headerLeft, ref, fg: fgOverride, fgMuted: fgMutedOverride, cardBg: cardBgOverride, titleVariant = 'headlineSmall', colorPreview }: ProfilesManagerProps) {
  const { dark, colors } = useAutoPaperTheme()
  const insets = useSafeAreaInsets()
  const { error: showErrorToast } = useToast()
  // Only one row is ever in edit mode at a time (see commitEdit, called before any new row opens),
  // so every EditRow instance can safely share this one host instead of each needing its own.
  const host = usePopoverHost()
  const fg = fgOverride ?? (dark ? '#FFFFFF' : '#000000')
  const fgMuted = fgMutedOverride ?? (dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)')
  const cardBg = cardBgOverride ?? (dark ? '#111111' : '#F2F2F2')
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
  // The explicit escape hatch for hosts whose "navigate away" doesn't genuinely unmount this
  // component — see ProfilesManagerHandle's own doc. `[]` deps: the handle object itself never
  // needs to change identity, since it always calls through the ref to whatever commitEdit is
  // current at call time, the same indirection the unmount effect above already relies on.
  useImperativeHandle(ref, () => ({ commitPendingEdit: () => commitEditRef.current() }), [])

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

  // The functional setDraftTag form — reading `previous` from React's own latest-applied state
  // rather than closing over the `draftTag` variable — matters here, not just style: fast/rapid
  // keystrokes can fire their onChangeText calls before a re-render lands, batched into the same
  // update, and clamping every one of them against the same stale `draftTag` (captured once at
  // render time) would let the later ones silently clobber what the earlier ones already clamped
  // to, rather than each building on the last.
  const handleTagChange = useCallback((tag: string) => {
    setDraftTag((previous) => clampTag(previous, tag))
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

  return (
    <>
      <View style={[styles.header, { paddingTop: 8 + insets.top, paddingLeft: 8 + insets.left }]}>
        {headerLeft}
        <Text variant={titleVariant} style={[styles.title, { color: fg }]}>
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
              return <EditRow key='new' draftName={draftName} onNameChange={handleNameChange} draftColor={draftColor} onColorChange={setDraftColor} draftTag={draftTag} onTagChange={handleTagChange} onSubmit={commitEdit} autoFocus fgMuted={fgMuted} host={host} dark={dark} colorPreview={colorPreview} />
            }

            const { profile } = row
            if (editingId === profile.id) {
              return <EditRow key={profile.id} draftName={draftName} onNameChange={handleNameChange} draftColor={draftColor} onColorChange={setDraftColor} draftTag={draftTag} onTagChange={handleTagChange} onSubmit={commitEdit} onDelete={() => setConfirmDeleteId(profile.id)} fgMuted={fgMuted} host={host} dark={dark} colorPreview={colorPreview} />
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
  onSubmit: () => void
  // Omitted for the 'new' row — nothing saved yet to delete.
  onDelete?: () => void
  autoFocus?: boolean
  fgMuted: string
  host: PopoverHost
  dark: boolean
  colorPreview?: (hex: string) => string
}

// One row, expanded: the color trigger (@tastic/hud's InlineColorPicker) — doubling as the tag's
// own display via its `tag` prop below, since there's no separate visible tag field anymore — an
// invisible TextInput that exists purely to actually capture what's typed (RN has no way to bring
// up a keyboard without a real focusable input; this one is just never meant to be *seen*), the
// name taking up the row's remaining space, and — only for an existing profile — a delete icon at
// the very end. The two effects below are what wires tapping the swatch to popping the keyboard on
// the hidden tag field too, so typing a tag and picking a color read as one combined action instead
// of two separate taps, with the swatch itself as the only place the tag ever visibly shows.
// Return-key chains tag -> name via @rific/focus-chain rather than each field submitting on its
// own — submitting the *name* field is what actually commits the row, so its registration's own
// onSubmitEditing (a no-op — it's last in the chain) is overridden with onSubmit below, matching
// how a normal multi-field form reads: fill fields in order, the last one finishes it.
function EditRow({ draftName, onNameChange, draftColor, onColorChange, draftTag, onTagChange, onSubmit, onDelete, autoFocus, fgMuted, host, dark, colorPreview }: EditRowProps) {
  const register = useFocusChain()
  const tag = register()
  const name = register()

  // tag.props.focus (from @rific/focus-chain's own register(), not tag.ref — that's a callback
  // ref, not a ref object, so it has no .current to read) is the hook's own imperative "focus this
  // exact registered field" call. Mirrored into a ref every render, same as commitEditRef above,
  // rather than read directly in the effect below: register() returns a brand-new props object on
  // every render (it isn't memoized), so depending on tag.props.focus directly would rerun that
  // effect — and refocus an already-focused field — on every keystroke into the tag field itself,
  // re-triggering its own selectTextOnFocus mid-type and wiping out what's being typed.
  const tagFocusRef = useRef(tag.props.focus)
  useEffect(() => {
    tagFocusRef.current = tag.props.focus
  })

  // Lets tapping the swatch itself hand focus straight to the tag field, so one tap both opens the
  // color popover (host.toggle, inside InlineColorPicker's own onPress) and pops the keyboard on
  // the tag field right next to it. Scoped to host.openId so this only fires on an actual open
  // transition, not on every re-render while it's already open.
  useEffect(() => {
    if (host.openId === 'color') tagFocusRef.current()
  }, [host.openId])

  return (
    <View style={styles.editRow}>
      <InlineColorPicker id='color' host={host} value={draftColor} onChange={onColorChange} previewValue={colorPreview} tag={draftTag} dark={dark} />
      {/* Invisible on purpose (styles.hiddenTagInput: zero footprint, position: 'absolute' so it
      doesn't reserve space in the row's own flex layout) — the swatch above is the only place this
      value is ever meant to be seen. pointerEvents='none' is what actually keeps it out of the
      way: without it, this field — even at 1x1 and fully transparent — still sits in front of the
      swatch for hit-testing purposes and swallows the tap meant to open the color popover, since
      focusing this field is never done by tapping it directly anyway (see the effect above, which
      focuses it programmatically). accessibilityLabel stands in for the placeholder a visible field
      would have had, so a screen reader still identifies it, and so this file's own tests can still
      find it as "Tag" the same way they find the Name field by its placeholder. selectTextOnFocus
      so re-tapping the swatch to revise an already-set tag replaces it wholesale rather than
      inserting mid-string. */}
      {/* eslint-disable-next-line react-hooks/refs -- tag.ref/tag.props come from useFocusChain's
      register(), called during render by design (see the hook's own doc); the actual DOM/native
      focus() call it wraps only ever fires later, from an event handler, never synchronously here */}
      <TextInput ref={tag.ref} {...tag.props} value={draftTag} onChangeText={onTagChange} accessibilityLabel='Tag' autoCapitalize='characters' selectTextOnFocus returnKeyType='next' style={styles.hiddenTagInput} pointerEvents='none' />
      {/* eslint-disable-next-line react-hooks/refs -- see the tag field's identical note above */}
      <TextInput ref={name.ref} {...name.props} onSubmitEditing={onSubmit} mode='outlined' dense value={draftName} onChangeText={onNameChange} maxLength={MAX_PROFILE_NAME_LENGTH} placeholder='Name' autoFocus={autoFocus} returnKeyType='done' style={styles.nameInput} />
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
  // 1x1 and fully transparent — there's nothing to see here on purpose (see EditRow's own comment
  // above the field this styles). position: 'absolute' pulls it out of editRow's flex flow
  // entirely, so it doesn't reserve a gap in the row the way a normal flex sibling would.
  hiddenTagInput: {
    height: 1,
    opacity: 0,
    position: 'absolute',
    width: 1
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
  title: {
    flexShrink: 1,
    fontWeight: 'bold'
  }
})
