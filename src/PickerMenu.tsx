import { defaultColors, FadingScrollView, getContrastColor, type SeedColor } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import type { PopoverHost, PopoverRotation } from '@tastic/hud/chrome'
import { PopoverBody, useAutoAlign } from '@tastic/hud/chrome'
import { ReactNode, RefObject, useState } from 'react'
import { type LayoutChangeEvent, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { Icon, Text } from 'react-native-paper'

import { IdentityChip } from './IdentityChip'
import { useProfileSwatchRenderer } from './ProfileColorContext'
import { SwatchLayer } from './SwatchLayer'

// The trigger and popover ProfilePicker and OptionPicker share: a name trigger (or the chip pill),
// a bordered menu of rows, and with a `colorSection` a Color row that swaps the menu for a page of
// swatches. Not exported from index.ts: each picker owns its own rows.

const TRIGGER_HEIGHT = 28
const POPOVER_WIDTH = 220
const ROW_HEIGHT = 36
const LIST_PADDING = 8
const MENU_BORDER_WIDTH = 2
// A row's own inset from the list's padded edge (`rowInner`'s paddingHorizontal); the color page
// lines its swatches up with it.
const ROW_INSET = 12
// The chip trigger (see `colorSection`): a CHIP_SIZE circle inside a pill padded by CHIP_TRIGGER_PADDING.
const CHIP_SIZE = 32
const CHIP_TRIGGER_PADDING = 6

// The color row and page (see `colorSection`). Every height here is fixed (explicit line heights),
// so pickerContentSize can size them exactly. Swatches are the same 28pt circles as
// @tastic/hud's InlineColorPicker, spread to span exactly the rows' content width (5 across, so
// 20 colors fill 4 full rows), with the same spacing between rows.
const SWATCH_SIZE = 28
const SWATCH_MIN_GAP = 6
// The selected swatch's white ring, drawn inside its SWATCH_SIZE.
const SWATCH_RING_WIDTH = 2
// The Color row's swatch of the color in effect, in the same 22pt slot as every row's chip.
const COLOR_ROW_SWATCH_SIZE = 22
// The Color row: a plain row's height, or taller with a caption line under the label.
const COLOR_ROW_CAPTIONED_HEIGHT = 48
const COLOR_LABEL_LINE = 18
const COLOR_CAPTION_LINE = 16
// The divider under the Color row: 1pt plus 4pt above and below, the same as the Manage divider.
const COLOR_ROW_DIVIDER = 9
// The color page: a back row, then the grid with this much space above and below it.
const GRID_TOP = 4
const GRID_BOTTOM = 8
const GRID_WIDTH = POPOVER_WIDTH - 2 * MENU_BORDER_WIDTH - 2 * LIST_PADDING - 2 * ROW_INSET
const GRID_COLUMNS = Math.floor((GRID_WIDTH + SWATCH_MIN_GAP) / (SWATCH_SIZE + SWATCH_MIN_GAP))
const GRID_GAP = (GRID_WIDTH - GRID_COLUMNS * SWATCH_SIZE) / (GRID_COLUMNS - 1)

// A color choice behind a row at the top of the popover (see ProfilePicker's `colorSection`).
export interface ProfilePickerColorSection {
  // The raw seed color in effect - matched against each swatch's own value for the checkmark.
  value: string
  onChange: (hex: string) => void
  // Transforms only what's drawn (each swatch's fill), leaving `value` and what `onChange` commits
  // untouched - the same contract as @tastic/hud's InlineColorPicker `previewValue`, for a host
  // that mutes or tints the seed before using it.
  previewValue?: (hex: string) => string
  swatches?: SeedColor[]
  // The row's label, and the color page's heading. Defaults to 'Color'.
  label?: string
  // One short line under the row's label, e.g. where the color applies.
  caption?: string
  // Another seat's color, if any: its swatch stays in the grid but is disabled and marked with an
  // X, the same as @tastic/hud's InlineColorPicker `takenValue`. Unless `allowSwapTaken` is set.
  takenValue?: string
  // Lets a press on the taken swatch pick it anyway (marked with a swap icon instead), for a host
  // that swaps the two colors - when the other seat is the CPU, not a second person. Same as
  // InlineColorPicker's `allowSwapTaken`.
  allowSwapTaken?: boolean
}

// A complete placement decision for the popover: which way it opens, how tall it may grow, whether
// this open's measurement has landed yet, and the ref attached to the measured trigger.
// Structurally identical to @tastic/hud's own `AlignResult` (exported from hud >= 0.12.0, and the
// same shape `useAutoAlign` itself returns) - declared here rather than imported so this package's
// public types don't start requiring a newer @tastic/hud than its peer range already admits. A
// hud `AlignResult` (e.g. from `useZoneClampedAlign`) is assignable to this as-is.
export interface ProfilePickerAlignResult {
  align: 'left' | 'right' | 'center'
  verticalAlign: 'below' | 'above'
  maxHeight: number
  measured: boolean
  triggerRef: RefObject<View | null>
}

export interface ProfilePickerContentSize {
  width: number
  height: number
}

function colorRowHeight(caption: string | undefined) {
  return caption ? COLOR_ROW_CAPTIONED_HEIGHT : ROW_HEIGHT
}

// The color page's content: the back row and the grid.
function colorPageHeight(swatches: SeedColor[]) {
  const rows = Math.ceil(swatches.length / GRID_COLUMNS)
  return ROW_HEIGHT + GRID_TOP + rows * SWATCH_SIZE + (rows - 1) * GRID_GAP + GRID_BOTTOM
}

// The popover's content footprint for `rowCount` rows: always POPOVER_WIDTH wide, tall enough for
// the rows plus the list's own padding. With a `colorSection`, it's the taller of the popover's two
// pages, exactly: the list with the Color row and its divider on top, or the color page (a back row
// and the swatches), so one placement fits whichever page is showing. It leaves out the menu's 2pt
// border and the Manage divider, ~13pt in all, so treat it as a placement estimate, not a
// pixel-exact measurement. getProfilePickerContentSize and getOptionPickerContentSize count the
// rows for their own picker.
export function pickerContentSize(rowCount: number, colorSection?: Pick<ProfilePickerColorSection, 'swatches' | 'caption'>): ProfilePickerContentSize {
  const list = rowCount * ROW_HEIGHT + (colorSection ? colorRowHeight(colorSection.caption) + COLOR_ROW_DIVIDER : 0)
  const content = colorSection ? Math.max(list, colorPageHeight(colorSection.swatches ?? defaultColors)) : list
  return { width: POPOVER_WIDTH, height: LIST_PADDING * 2 + content }
}

interface PickerMenuProps {
  // The popover id this trigger toggles on `host`.
  id: string
  host: PopoverHost
  // The seat/context's live color: the menu's border and caret, the plain trigger's label, the chip.
  color: string
  dark: boolean
  // The trigger's text, uppercased here.
  label: string
  // Turns the trigger into the chip pill: a circle in `color` with `tag` (or `icon`), then the label
  // and the chevron. Omit for the plain name trigger.
  chip?: { tag?: string; icon: string }
  colorSection?: ProfilePickerColorSection
  // The color whose swatch carries a dot on the color page (see ColorPage).
  homeColor?: string
  // The list page's size, from pickerContentSize, for the automatic placement.
  contentSize: ProfilePickerContentSize
  align?: 'left' | 'right' | 'center'
  alignOverride?: ProfilePickerAlignResult
  rotation: PopoverRotation
  triggerStyle?: StyleProp<ViewStyle>
  // Pinned under the list page's rows, behind a divider (ProfilePicker's Manage row).
  footer?: ReactNode
  // The list page's rows.
  children: ReactNode
}

export function PickerMenu({ id, host, color, dark, label, chip, colorSection, homeColor, contentSize, align: forcedAlign, alignOverride, rotation, triggerStyle, footer, children }: PickerMenuProps) {
  const menuBg = dark ? '#000000' : '#FFFFFF'
  const fg = dark ? '#FFFFFF' : '#000000'

  const open = host.openId === id
  // Always called, even when `alignOverride` is supplied and this result goes unused - hooks can't
  // be conditional (see @tastic/hud's InlineColorPicker for the identical pattern). With an
  // override its triggerRef is never attached, so this hook's own measurement is a no-op.
  const auto = useAutoAlign(open, contentSize.width, contentSize.height, rotation)
  const placement = alignOverride ?? auto
  const { maxHeight, measured, triggerRef, verticalAlign } = placement
  const align = forcedAlign ?? placement.align

  // The chip trigger is a whole pill, so the caret points at its middle: PopoverBody places the
  // caret half a `triggerSize` in from the side the popover is aligned to, so the pill's own width
  // centers it whichever way the popover opens. The plain trigger keeps TRIGGER_HEIGHT, as before.
  const chipTrigger = !!chip
  const [triggerWidth, setTriggerWidth] = useState(0)
  const handleAnchorLayout = chipTrigger ? (e: LayoutChangeEvent) => setTriggerWidth(e.nativeEvent.layout.width) : undefined
  // Which page the popover shows. Reset on every press of the trigger, so an open always starts on
  // the list (a press away closes the popover without coming back through here).
  const [colorPage, setColorPage] = useState(false)
  const showColorPage = !!colorSection && colorPage
  const handleTriggerPress = () => {
    setColorPage(false)
    host.toggle(id)
  }
  const triggerLabel = label.toUpperCase()
  // Shown on the list page only (see the footer below).
  const showFooter = !!footer && !showColorPage

  return (
    <View style={[styles.anchor, open && styles.anchorOpen]} onLayout={handleAnchorLayout}>
      <TouchableRipple onPress={handleTriggerPress} borderless={chipTrigger} style={[styles.trigger, chipTrigger && styles.chipTrigger, triggerStyle]} accessibilityRole='button' accessibilityLabel={triggerLabel}>
        <View ref={triggerRef} collapsable={false} style={chipTrigger ? styles.chipTriggerInner : styles.triggerInner}>
          {chip && <IdentityChip color={color} tag={chip.tag} icon={chip.icon} size={CHIP_SIZE} />}
          {/* The chip trigger's name and chevron are plain fg: the chip carries the color, and a muted
          color on the host's pill read dim. The plain trigger keeps the color, which is what tells a
          multi-seat game's seats apart. */}
          <Text style={[styles.triggerLabel, { color: chipTrigger ? fg : color }]} numberOfLines={1}>
            {triggerLabel}
          </Text>
          <Icon source='menu-down' size={16} color={chipTrigger ? fg : color} />
        </View>
      </TouchableRipple>

      {/* Gated on `measured`, not just `open` - see InlineColorPicker's identical fix. */}
      <PopoverBody visible={open && measured} align={align} verticalAlign={verticalAlign} caretColor={menuBg} caretBorderColor={color} caretBorderWidth={MENU_BORDER_WIDTH} triggerSize={chipTrigger ? triggerWidth : TRIGGER_HEIGHT}>
        {/* The box (background, border, max height) is a plain View around the scroller, so
        FadingScrollView's edge fade - the same cue as a dialog's scrolling rows - masks only the
        rows, never the menu's own border or background. */}
        <View
          style={[
            styles.menu,
            {
              backgroundColor: menuBg,
              borderColor: color,
              width: POPOVER_WIDTH,
              maxHeight
            }
          ]}
        >
          {/* Keyed by page, so swapping pages starts the new one scrolled to its top. */}
          <FadingScrollView key={showColorPage ? 'color' : 'list'} contentContainerStyle={[styles.menuContent, showFooter && styles.menuContentAboveFooter]} showsVerticalScrollIndicator={false}>
            {colorSection && colorPage ? (
              <ColorPage section={colorSection} homeColor={homeColor} fg={fg} onBack={() => setColorPage(false)} />
            ) : (
              <>
                {colorSection && <ColorRow section={colorSection} fg={fg} dividerColor={color} onPress={() => setColorPage(true)} />}
                {children}
              </>
            )}
          </FadingScrollView>
          {/* The footer is pinned below the scrolling rows, the way a dialog's Done sits below its
          rows: always reachable, with the rows fading out above its divider while there are more
          below. Not on the color page, which only has the back row and the swatches. */}
          {showFooter && (
            <View style={styles.menuFooter}>
              <View style={[styles.divider, { backgroundColor: color }]} />
              {footer}
            </View>
          )}
        </View>
      </PopoverBody>
    </View>
  )
}

interface IconRowProps {
  icon: string
  // The icon's color while the row isn't selected (an OptionPicker option's own `color`). Defaults to
  // `fg`, like the label.
  iconColor?: string
  label: string
  // Fills the row with `color` (its icon and label then contrast against it).
  selected: boolean
  color: string
  fg: string
  disabled?: boolean
  onPress: () => void
}

// A selectable row led by an icon: ProfilePicker's null/"guest" row, and every OptionPicker row.
// A selected row's own background fills entirely with its identity color - matching how a selected
// row reads elsewhere (see @tastic/hud's SectionedDropdown) rather than a checkmark bolted onto an
// otherwise-plain row.
export function IconRow({ icon, iconColor, label, selected, color, fg, disabled = false, onPress }: IconRowProps) {
  const textColor = selected ? getContrastColor(color) : fg
  return (
    <TouchableRipple disabled={disabled} onPress={onPress} style={[pickerMenuStyles.row, selected && { backgroundColor: color }]}>
      <View style={[pickerMenuStyles.rowInner, disabled && pickerMenuStyles.rowDisabled]}>
        {/* Unfilled, matching a selected profile row's own ProfileChip treatment - no background
        circle, but still the same fixed-size slot every row's icon/chip sits in (see ProfileChip's
        own doc), so this row's icon stays lined up with every other row regardless of selection. */}
        <View style={styles.iconSlot}>
          <Icon source={icon} size={13} color={selected ? textColor : (iconColor ?? textColor)} />
        </View>
        <Text style={[pickerMenuStyles.rowLabel, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </TouchableRipple>
  )
}

// The list page's top row: a swatch of the color in effect, the label (and caption), and a chevron
// to the color page. A divider sets it apart from the selectable rows under it.
function ColorRow({ section, fg, dividerColor, onPress }: { section: ProfilePickerColorSection; fg: string; dividerColor: string; onPress: () => void }) {
  const { value, previewValue, label = 'Color', caption } = section
  const renderSwatch = useProfileSwatchRenderer()
  const drawn = previewValue ? previewValue(value) : value
  return (
    <>
      <TouchableRipple onPress={onPress} style={[pickerMenuStyles.row, { height: colorRowHeight(caption) }]} accessibilityRole='button' accessibilityLabel={caption ? `${label}, ${caption}` : label}>
        <View style={pickerMenuStyles.rowInner}>
          {/* A ProfileColorProvider renderSwatch draws it in place of the flat fill. */}
          <View style={[styles.colorRowSwatch, !renderSwatch && { backgroundColor: drawn }]}>{renderSwatch && <SwatchLayer render={renderSwatch} color={drawn} size={COLOR_ROW_SWATCH_SIZE} />}</View>
          <View style={styles.colorRowText}>
            <Text style={[styles.colorRowLabel, { color: fg }]} numberOfLines={1}>
              {label}
            </Text>
            {caption ? (
              <Text style={[styles.colorRowCaption, { color: fg }]} numberOfLines={1}>
                {caption}
              </Text>
            ) : null}
          </View>
          <Icon source='chevron-right' size={18} color={fg} />
        </View>
      </TouchableRipple>
      <View style={[styles.divider, { backgroundColor: dividerColor }]} />
    </>
  )
}

// The color page: a back row to the list, then the swatches. `homeColor` is the selected profile's
// own color: its swatch carries a dot, so a player who has picked something else can find their way
// back to it (the profile's row shows that color, but matching it to one of two similar swatches by
// eye is guesswork). The check takes the dot's place on the swatch in effect, so the dot only shows
// while the color in effect is another one. Another seat's color (`takenValue`) is marked with an X
// and disabled, or a swap icon when `allowSwapTaken` lets it be picked. A ProfileColorProvider
// `renderSwatch` draws each swatch in place of its flat fill (inside the selected one's ring), with
// the mark's contrast still taken from the swatch's own color.
function ColorPage({ section, homeColor, fg, onBack }: { section: ProfilePickerColorSection; homeColor?: string; fg: string; onBack: () => void }) {
  const { value, onChange, previewValue, swatches = defaultColors, label = 'Color', takenValue, allowSwapTaken } = section
  const renderSwatch = useProfileSwatchRenderer()
  const displayFor = previewValue ?? ((hex: string) => hex)
  return (
    <>
      <TouchableRipple onPress={onBack} style={pickerMenuStyles.row} accessibilityRole='button' accessibilityLabel='Back'>
        <View style={pickerMenuStyles.rowInner}>
          <View style={styles.iconSlot}>
            <Icon source='chevron-left' size={20} color={fg} />
          </View>
          <Text style={[styles.colorRowLabel, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </TouchableRipple>
      <View style={styles.swatches}>
        {swatches.map((swatch) => {
          const selected = swatch.value.toLowerCase() === value.toLowerCase()
          const isHomeColor = !!homeColor && swatch.value.toLowerCase() === homeColor.toLowerCase()
          const taken = !selected && !!takenValue && swatch.value.toLowerCase() === takenValue.toLowerCase()
          const swappable = taken && !!allowSwapTaken
          const swatchDisplay = displayFor(swatch.value)
          const contrast = getContrastColor(swatchDisplay)
          const accessibilityLabel = swappable ? `${swatch.label}, swap` : taken ? `${swatch.label}, taken` : isHomeColor ? `${swatch.label}, profile color` : swatch.label
          const mark = selected ? <Icon source='check' size={16} color={contrast} /> : swappable ? <Icon source='swap-horizontal' size={16} color={contrast} /> : taken ? <Icon source='close' size={16} color={contrast} /> : isHomeColor ? <View style={[styles.homeDot, { backgroundColor: contrast }]} /> : <View />
          // The same swatch as @tastic/hud's InlineColorPicker: a filled circle, the selected one
          // ringed and checked, a taken one faded with an X. TouchableRipple takes one child, so a
          // drawn swatch and its mark share a face that fills the circle inside the ring.
          return (
            <TouchableRipple key={swatch.value} disabled={taken && !swappable} onPress={() => onChange(swatch.value)} borderless style={[styles.swatch, !renderSwatch && { backgroundColor: swatchDisplay }, selected && styles.swatchSelected, taken && !swappable && styles.swatchTaken]} accessibilityRole='button' accessibilityLabel={accessibilityLabel} accessibilityState={{ selected, disabled: taken && !swappable }}>
              {renderSwatch ? (
                <View style={styles.swatchFace}>
                  <SwatchLayer render={renderSwatch} color={swatchDisplay} size={selected ? SWATCH_SIZE - 2 * SWATCH_RING_WIDTH : SWATCH_SIZE} />
                  {mark}
                </View>
              ) : (
                mark
              )}
            </TouchableRipple>
          )
        })}
      </View>
    </>
  )
}

// The rows' own styles, shared with ProfilePicker's profile rows.
export const pickerMenuStyles = StyleSheet.create({
  row: {
    borderRadius: 8,
    height: ROW_HEIGHT
  },
  rowDisabled: {
    opacity: 0.35
  },
  rowInner: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 8,
    paddingHorizontal: ROW_INSET
  },
  rowLabel: {
    flex: 1,
    fontSize: 14
  }
})

const styles = StyleSheet.create({
  anchor: {
    position: 'relative'
  },
  // See InlineColorPicker's identical comment - React Native Web gives every position:'relative'
  // view its own stacking context, so the elevation has to live on the anchor itself.
  anchorOpen: {
    zIndex: 100
  },
  // The pill, rounded at both ends. The host adds its own background through `triggerStyle`.
  chipTrigger: {
    borderRadius: (CHIP_SIZE + 2 * CHIP_TRIGGER_PADDING) / 2
  },
  // The padding lives on the measured view, not the pressable around it, so the placement measures
  // the pill's real edge: measured from inside the padding, a popover opening toward a screen edge
  // was sized as if the pill were 6pt further from it, and ran 2pt past that edge.
  chipTriggerInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    height: CHIP_SIZE + 2 * CHIP_TRIGGER_PADDING,
    paddingLeft: CHIP_TRIGGER_PADDING,
    paddingRight: CHIP_TRIGGER_PADDING + 8
  },
  colorRowCaption: {
    fontSize: 12,
    lineHeight: COLOR_CAPTION_LINE,
    opacity: 0.6
  },
  // A row's label, with a line height so the captioned Color row's height is exact.
  colorRowLabel: {
    fontSize: 14,
    lineHeight: COLOR_LABEL_LINE
  },
  // The color in effect, in the same 22pt slot as every row's chip.
  colorRowSwatch: {
    borderRadius: COLOR_ROW_SWATCH_SIZE / 2,
    height: COLOR_ROW_SWATCH_SIZE,
    width: COLOR_ROW_SWATCH_SIZE
  },
  colorRowText: {
    flex: 1
  },
  // Separates the footer (a navigation action) and the Color row from the selectable rows - a
  // different kind of action, not just another row in the same list. Tinted with the seat's own color
  // (passed in as backgroundColor) rather than a flat gray, matching the border/caret's own
  // accent-tinted look.
  divider: {
    height: 1,
    marginVertical: 4,
    opacity: 0.25
  },
  // The selected profile's own color (see ColorPage).
  homeDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  // Matches ProfileChip's own default size/shape exactly (see IconRow's own render-site comment) -
  // no backgroundColor, unlike ProfileChip's own default: an icon row has no identity color of its
  // own to fill it with, and the render site colors the icon directly instead.
  iconSlot: {
    alignItems: 'center',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    width: 22
  },
  menu: {
    borderRadius: 12,
    borderWidth: MENU_BORDER_WIDTH,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8
  },
  // Padded on every side (not just top/bottom) - a selected row's own full-color background (see
  // `row`'s borderRadius) needs real margin from the menu's own straight edges to read as a rounded
  // pill instead of looking clipped against them.
  menuContent: {
    padding: LIST_PADDING
  },
  // With a footer pinned below, its own padding takes the bottom edge (same total height as before).
  menuContentAboveFooter: {
    paddingBottom: 0
  },
  menuFooter: {
    paddingBottom: LIST_PADDING,
    paddingHorizontal: LIST_PADDING
  },
  swatch: {
    alignItems: 'center',
    borderRadius: SWATCH_SIZE / 2,
    height: SWATCH_SIZE,
    justifyContent: 'center',
    width: SWATCH_SIZE
  },
  // A drawn swatch (see ColorPage) and its mark: the whole circle inside the selected one's ring.
  swatchFace: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  swatchSelected: {
    borderColor: '#ffffff',
    borderWidth: SWATCH_RING_WIDTH
  },
  swatchTaken: {
    opacity: 0.35
  },
  swatches: {
    columnGap: GRID_GAP,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: GRID_BOTTOM,
    marginHorizontal: ROW_INSET,
    marginTop: GRID_TOP,
    rowGap: GRID_GAP,
    width: GRID_WIDTH
  },
  trigger: {
    alignSelf: 'flex-start'
  },
  triggerInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    height: TRIGGER_HEIGHT
  },
  triggerLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1
  }
})
