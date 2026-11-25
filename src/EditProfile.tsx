import { defaultColors, FadingScrollView, getContrastColor, useAutoPaperTheme } from '@rific/auto-paper'
import { Button, IconButton, TouchableRipple } from '@rific/feedback-press'
import { useFocusChain } from '@rific/focus-chain'
import { useLettering } from '@tastic/hud/chrome'
import { type ReactNode, useMemo, useState } from 'react'
import { KeyboardAvoidingView, type LayoutChangeEvent, Platform, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Icon, Text, TextInput } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { EditProfileColorsContext, SectionLabel } from './EditProfileSection'
import { IdentityChip } from './IdentityChip'
import { useProfileSwatchRenderer } from './ProfileColorContext'
import { isValidTag, MAX_PROFILE_NAME_LENGTH } from './profilesValidation'
import { drawSwatch, SwatchLayer } from './SwatchLayer'

// The chip at the top: the profile as it will look, big enough to read its tag at a glance.
export const EDIT_CHIP_SIZE = 96
// The form is held to a column this wide in a wide window (a browser), centered: name and tag fields
// stretched across a desktop read as one long line, and the color grid as a strip.
export const EDIT_FORM_MAX_WIDTH = 480
// The screen's side padding, as the roster's (ProfilesManager's `content`).
const SIDE_PADDING = 20
// The color grid's swatches: never smaller than SWATCH_MIN (a fingertip), never bigger than
// SWATCH_MAX (a phone's 5 across would be 59), at least SWATCH_MIN_GAP apart.
export const SWATCH_MIN = 34
export const SWATCH_MAX = 52
export const SWATCH_MIN_GAP = 10
// The selected swatch's ring, drawn inside it in the screen's text color (white on dark, black on
// light), so it reads on either; the pickers' color page rings in white, which vanishes on a light
// screen.
const SWATCH_RING = 3

// The two hints, a pair (Jay, 2026-11-20): strangers see the tag, and only friends you invite ever see
// the name. True in every game, so the same everywhere: one that sends no name to a server (CardTastic's
// leaderboards) or has no online play shows the name to nobody.
export const NAME_HINT = 'Only friends you invite online see your name.'
export const TAG_HINT = 'Up to 3 letters or an emoji, drawn on your color. Wherever strangers can see you, they see this instead of your name.'

// A focus-chain ref as a Paper TextInput takes it. Paper types its input's handle as
// Pick<TextInput, 'focus' | ...>, which React Native 0.88's strict types read as `focus: unknown`
// (TextInput is a function there, not a class), so focus-chain's ref, which wants `focus(): void`,
// no longer fits the prop. The handle does have focus() at run time.
const textInputRef = (ref: (el: { focus: () => void } | null) => void) => ref as (el: unknown) => void

const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export interface Swatch {
  label: string
  value: string
}

// The swatches the grid offers: auto-paper's palette, led by `startColor` (the color the profile had
// when this screen opened, or a new profile's default) when it isn't one of the palette's, so a profile
// on a color from elsewhere (an older default, another game) shows it picked, and trying another color
// can always come back to it.
export function editSwatches(startColor: string, palette: readonly Swatch[] = defaultColors): Swatch[] {
  return palette.some((swatch) => sameColor(swatch.value, startColor)) ? [...palette] : [{ label: 'Current color', value: startColor }, ...palette]
}

const fits = (width: number, columns: number) => (width - SWATCH_MIN_GAP * (columns - 1)) / columns >= SWATCH_MIN

// How many of `count` swatches go in a row of `width`: the most that keep each one SWATCH_MIN wide, cut
// back to a count that fills every row evenly unless that would leave fewer than half as many columns
// as fit, where uneven rows read better than a few swatches lost in space. Laid out for the swatches
// shown (Jay, 2026-11-20: the grid should come out even): auto-paper's 20 are 4 rows of 5 on a phone
// and 2 of 10 in a browser's column, and with an off-palette color leading them (editSwatches), 21 are
// 3 rows of 7, its swatches a little smaller. That's rare once a game's new profiles start on a palette
// color (HexFleet's did start on its Vanguard blue). The grid used to keep that slot always, so its
// size never changed, but then a palette color's profile, the usual case, ended a swatch short.
export function gridColumns(width: number, count: number): number {
  if (count <= 1) return 1
  let most = 1
  for (let columns = 2; columns <= count; columns++) if (fits(width, columns)) most = columns
  for (let columns = most; columns >= 1; columns--) {
    if (count % columns === 0) return columns * 2 >= most ? columns : most
  }
  return most
}

// A swatch's diameter and the space between swatches (across and down alike, so the grid is square)
// for `columns` across `width`: as big as the row allows up to SWATCH_MAX, the rest shared out as
// space between them.
export function gridLayout(width: number, columns: number): { size: number; gap: number } {
  const size = Math.min(SWATCH_MAX, (width - SWATCH_MIN_GAP * (columns - 1)) / columns)
  const gap = columns > 1 ? (width - columns * size) / (columns - 1) : 0
  return { size, gap }
}

interface EditProfileProps {
  // 'New Profile' as the title, the name field focused, and no Delete Profile.
  isNew: boolean
  draftName: string
  onNameChange: (name: string) => void
  draftTag: string
  onTagChange: (tag: string) => void
  draftColor: string
  onColorChange: (color: string) => void
  // The color the profile had when this screen opened (see editSwatches).
  startColor: string
  // Saves the draft and leaves the screen. The back arrow, Done and the tag field's Return all do
  // this; a swipe back or a back button saves too, as the screen goes (EditProfileScreen's unmount
  // flush and commitPendingEdit): nothing typed is ever lost.
  onDone: () => void
  // Omitted for a new profile: nothing saved yet to delete.
  onDelete?: () => void
  // A game's own sections for a saved profile (EditProfileScreen's `sections`), under Color and above Delete Profile
  extra?: ReactNode
  fg: string
  fgMuted: string
  titleVariant: 'displayLarge' | 'displayMedium' | 'displaySmall' | 'headlineLarge' | 'headlineMedium' | 'headlineSmall' | 'titleLarge' | 'titleMedium' | 'titleSmall' | 'labelLarge' | 'labelMedium' | 'labelSmall' | 'bodyLarge' | 'bodyMedium' | 'bodySmall'
  colorPreview?: (hex: string) => string
}

// What EditProfileScreen draws for one profile (Jay, 2026-11-20, picked from three mockups over the
// roster's inline edit row, which hid the tag in an invisible field behind the color circle): the
// back arrow and title with Done on the right, the profile's chip big at the top as it will look,
// then Name, Tag (a field you can see, with what it takes and what it's for) and Color (the swatch
// grid on the screen, not in a popover), and Delete Profile at the bottom for a saved profile.
// Return goes Name to Tag, and Tag's Return finishes. Presentational: EditProfileScreen holds the
// drafts and the saving. Not exported from index.ts.
export function EditProfile({ isNew, draftName, onNameChange, draftTag, onTagChange, draftColor, onColorChange, startColor, onDone, onDelete, extra, fg, fgMuted, titleVariant, colorPreview }: EditProfileProps) {
  const { colors } = useAutoPaperTheme()
  const insets = useSafeAreaInsets()
  // The title in the game's own lettering, as the roster's (ProfilesManager).
  const { title: lettering } = useLettering()
  const { width: windowWidth } = useWindowDimensions()
  const textColors = useMemo(() => ({ fg, fgMuted }), [fg, fgMuted])
  const register = useFocusChain()
  const name = register()
  const tag = register()

  // A tag the field can't type its way into (clampTag), so only one loaded from storage: saved as
  // none, with a toast, on Done (EditProfileScreen's save). Until then the field shows it as an
  // error and the chip shows what will be saved.
  const tagInvalid = !isValidTag(draftTag)
  const drawn = colorPreview ? colorPreview(draftColor) : draftColor
  const preview = colorPreview ?? ((hex: string) => hex)
  // The grid's width before it has measured itself (the window less the padding, up to the form's
  // column), so its first frame is already laid out; onLayout corrects it inside a narrower host.
  const estimatedWidth = Math.min(EDIT_FORM_MAX_WIDTH, windowWidth - 2 * SIDE_PADDING - insets.left - insets.right)

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: 8 + insets.top, paddingLeft: 8 + insets.left, paddingRight: 8 + insets.right }]}>
        {/* The back arrow ProfilesScreen draws, in the same place as the roster's headerLeft, so the
        corner holds still as the roster gives way to this screen. */}
        <IconButton icon='arrow-left' iconColor={fg} size={24} onPress={onDone} accessibilityLabel='Back' />
        <Text variant={titleVariant} style={[styles.title, { color: fg }, lettering]} numberOfLines={1}>
          {isNew ? 'New Profile' : 'Edit Profile'}
        </Text>
        <Button mode='text' onPress={onDone} textColor={colors.primary} labelStyle={styles.doneLabel} style={styles.done} accessibilityLabel='Done'>
          Done
        </Button>
      </View>

      {/* Keeps the focused field above the keyboard; a tap on a swatch while a field is focused picks
      it on the first tap (keyboardShouldPersistTaps) instead of only dropping the keyboard. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <FadingScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom, paddingLeft: SIDE_PADDING + insets.left, paddingRight: SIDE_PADDING + insets.right }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps='handled'>
          <View style={styles.form}>
            <View style={styles.chip}>
              <IdentityChip color={drawn} tag={tagInvalid ? '' : draftTag} icon='account' size={EDIT_CHIP_SIZE} />
            </View>

            <View style={styles.section}>
              <SectionLabel color={fgMuted}>Name</SectionLabel>
              <TextInput ref={textInputRef(name.ref)} {...name.props} mode='outlined' dense value={draftName} onChangeText={onNameChange} maxLength={MAX_PROFILE_NAME_LENGTH} placeholder='Name' accessibilityLabel='Name' accessibilityHint={NAME_HINT} autoFocus={isNew} autoCapitalize='words' returnKeyType='next' />
              <Text style={[styles.hint, { color: fgMuted }]}>{NAME_HINT}</Text>
            </View>

            <View style={styles.section}>
              <SectionLabel color={fgMuted}>Tag</SectionLabel>
              {/* selectTextOnFocus: a tag is at most 3 letters, and clampTag refuses a 4th, so typing
              into a full tag would do nothing; selected, a tap and a letter start it over. The text is
              centered, as it is on the chip: one letter or emoji at the left of the 120 wide field
              looked lost (Jay, 2026-11-25). */}
              <TextInput ref={textInputRef(tag.ref)} {...tag.props} onSubmitEditing={onDone} mode='outlined' dense value={draftTag} onChangeText={onTagChange} accessibilityLabel='Tag' accessibilityHint={TAG_HINT} autoCapitalize='characters' autoCorrect={false} selectTextOnFocus returnKeyType='done' error={tagInvalid} style={styles.tagInput} contentStyle={styles.tagContent} />
              <Text style={[styles.hint, { color: tagInvalid ? colors.danger : fgMuted }]}>{TAG_HINT}</Text>
            </View>

            <View style={styles.section}>
              <SectionLabel color={fgMuted}>Color</SectionLabel>
              <ColorGrid swatches={editSwatches(startColor)} value={draftColor} onChange={onColorChange} preview={preview} ring={fg} estimatedWidth={estimatedWidth} />
            </View>

            {extra && <EditProfileColorsContext.Provider value={textColors}>{extra}</EditProfileColorsContext.Provider>}

            {onDelete && (
              <Button mode='outlined' icon='trash-can-outline' onPress={onDelete} textColor={colors.danger} style={[styles.delete, { borderColor: colors.danger }]}>
                Delete Profile
              </Button>
            )}
          </View>
        </FadingScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

interface ColorGridProps {
  swatches: Swatch[]
  value: string
  onChange: (color: string) => void
  preview: (hex: string) => string
  // The selected swatch's ring.
  ring: string
  estimatedWidth: number
}

// The palette as a grid filling the form's width (gridColumns, gridLayout), each swatch drawn through
// ProfileColorProvider (its `preview`, and its `renderSwatch` as a 'colorPage': where a color is
// chosen, so Hangman's triad pies show here), the selected one ringed and checked. Rows are laid out
// one by one rather than wrapped, so a gap worked out to a fraction of a point can't push a swatch
// onto the next line.
function ColorGrid({ swatches, value, onChange, preview, ring, estimatedWidth }: ColorGridProps) {
  const renderSwatch = useProfileSwatchRenderer()
  const [measured, setMeasured] = useState<number | null>(null)
  const width = measured ?? estimatedWidth
  const columns = gridColumns(width, swatches.length)
  const { size, gap } = gridLayout(width, columns)
  const rows: Swatch[][] = []
  for (let i = 0; i < swatches.length; i += columns) rows.push(swatches.slice(i, i + columns))
  const handleLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width
    if (next > 0) setMeasured(next)
  }

  return (
    <View onLayout={handleLayout} style={[styles.grid, { rowGap: gap }]} accessibilityRole='radiogroup' accessibilityLabel='Color'>
      {rows.map((row) => (
        <View key={row[0].value} style={[styles.gridRow, { columnGap: gap }]}>
          {row.map((swatch) => {
            const selected = sameColor(swatch.value, value)
            const swatchDisplay = preview(swatch.value)
            const drawnSize = selected ? size - 2 * SWATCH_RING : size
            const drawing = drawSwatch(renderSwatch, swatchDisplay, drawnSize, 'colorPage')
            const mark = selected ? <Icon source='check' size={Math.round(size * 0.45)} color={getContrastColor(swatchDisplay)} /> : <View />
            // TouchableRipple takes one child, so a drawn swatch and its mark share a face that fills
            // the circle inside the ring (the pickers' color page does the same).
            return (
              <TouchableRipple key={swatch.value} onPress={() => onChange(swatch.value)} borderless style={[styles.swatch, { borderRadius: size / 2, height: size, width: size }, drawing === null && { backgroundColor: swatchDisplay }, selected && { borderColor: ring, borderWidth: SWATCH_RING }]} accessibilityRole='radio' accessibilityLabel={swatch.label} accessibilityState={{ selected, checked: selected }}>
                {drawing !== null ? (
                  <View style={styles.swatchFace}>
                    <SwatchLayer size={drawnSize}>{drawing}</SwatchLayer>
                    {mark}
                  </View>
                ) : (
                  mark
                )}
              </TouchableRipple>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    paddingBottom: 4,
    paddingTop: 8
  },
  content: {
    flexGrow: 1
  },
  delete: {
    alignSelf: 'center',
    marginTop: 12
  },
  done: {
    marginRight: 6
  },
  doneLabel: {
    fontSize: 16,
    fontWeight: '700'
  },
  form: {
    alignSelf: 'center',
    gap: 24,
    maxWidth: EDIT_FORM_MAX_WIDTH,
    width: '100%'
  },
  grid: {
    alignSelf: 'stretch'
  },
  gridRow: {
    flexDirection: 'row'
  },
  // The roster's header (ProfilesManager), with Done at the far end.
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 8
  },
  hint: {
    fontSize: 13,
    lineHeight: 18
  },
  screen: {
    flex: 1
  },
  section: {
    gap: 8
  },
  swatch: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  // A drawn swatch (see ColorGrid) and its mark: the whole circle inside the selected one's ring.
  swatchFace: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  // Wide enough for three wide letters or an emoji, not a line of text.
  tagContent: {
    textAlign: 'center'
  },
  tagInput: {
    width: 120
  },
  title: {
    flex: 1,
    fontWeight: 'bold'
  }
})
