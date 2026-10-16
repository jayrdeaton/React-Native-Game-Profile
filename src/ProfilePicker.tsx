import { defaultColors, FadingScrollView, getContrastColor, type SeedColor } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import { PopoverBody, PopoverHost, PopoverRotation, useAutoAlign } from '@tastic/hud'
import { RefObject, useMemo, useState } from 'react'
import { type LayoutChangeEvent, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { Icon, Text } from 'react-native-paper'

import { IdentityChip } from './IdentityChip'
import { ProfileChip } from './ProfileChip'
import { useProfileColorPreview } from './ProfileColorContext'
import { Profile } from './types'

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
// so getProfilePickerContentSize can size them exactly. Swatches are the same 28pt circles as
// @tastic/hud's InlineColorPicker, spread to span exactly the rows' content width (5 across, so
// 20 colors fill 4 full rows), with the same spacing between rows.
const SWATCH_SIZE = 28
const SWATCH_MIN_GAP = 6
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
}

function colorRowHeight(caption: string | undefined) {
  return caption ? COLOR_ROW_CAPTIONED_HEIGHT : ROW_HEIGHT
}

// The color page's content: the back row and the grid.
function colorPageHeight(swatches: SeedColor[]) {
  const rows = Math.ceil(swatches.length / GRID_COLUMNS)
  return ROW_HEIGHT + GRID_TOP + rows * SWATCH_SIZE + (rows - 1) * GRID_GAP + GRID_BOTTOM
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

// The popover's content footprint for a given roster size: always POPOVER_WIDTH wide, tall enough
// for the null/"guest" row + one row per profile + (when `hasManageRow`, i.e. when the picker is
// given an `onManage`) the trailing Manage row, plus the list's own padding. With a
// `colorSection` (the same object handed to the picker works), it's the taller of the popover's
// two pages, exactly: the list with the Color row and its divider on top, or the color page (a
// back row and the swatches), so one placement fits whichever page is showing. This is the size
// ProfilePicker hands to `useAutoAlign` - the ONE formula, used by the component itself (it leaves
// out the menu's 2pt border and the Manage divider, ~13pt in all, so treat it as a placement
// estimate, not a pixel-exact measurement) - exported
// so a host supplying its own placement through `alignOverride` can size that placement hook (its
// own useAutoAlign/useZoneClampedAlign call) to match the popover it is actually positioning,
// instead of copying these constants and drifting whenever they change here.
export function getProfilePickerContentSize(profileCount: number, hasManageRow = false, colorSection?: Pick<ProfilePickerColorSection, 'swatches' | 'caption'>): ProfilePickerContentSize {
  const rowCount = profileCount + 1 + (hasManageRow ? 1 : 0)
  const list = rowCount * ROW_HEIGHT + (colorSection ? colorRowHeight(colorSection.caption) + COLOR_ROW_DIVIDER : 0)
  const content = colorSection ? Math.max(list, colorPageHeight(colorSection.swatches ?? defaultColors)) : list
  return { width: POPOVER_WIDTH, height: LIST_PADDING * 2 + content }
}

interface ProfilePickerProps<P extends Profile> {
  // Namespaces this trigger's id - pass something unique per instance whenever more than one of
  // these shares a PopoverHost (e.g. one per seat).
  idPrefix: string
  // The host this trigger's popover opens against - share one host across sibling pickers (a
  // seat's color/tag/profile triggers) so opening one closes any other in the same group.
  host: PopoverHost
  profiles: P[]
  selectedId: string | null
  // Another picker's currently-selected profile id, if any - disabled in this list. Useful when a
  // profile shouldn't be selectable in two places at once (e.g. two seats in a local-multiplayer
  // game, where double-selecting one profile would double-count its stats as both winner and
  // loser) - omit if that doesn't apply.
  takenId?: string | null
  // Tint for the trigger's own label/icon - pass the seat/context's current live color so the
  // trigger reads as one identity with whatever it's paired with.
  color: string
  dark: boolean
  // Forces a specific horizontal alignment, beating whatever the placement (the automatic
  // measurement, or `alignOverride` below) would have picked. Omit to let placement decide.
  align?: 'left' | 'right' | 'center'
  // Substitutes the popover's whole placement - horizontal/vertical alignment, max height, the
  // `measured` gate and the trigger ref - for the automatic `useAutoAlign` one, for a host whose
  // trigger sits somewhere that hook's plain window-relative measurement gets wrong. The motivating
  // case is a FAKE-rotated frame (a View turned +-90deg while the OS stays portrait-locked):
  // `measureInWindow` reports a rect in true screen space, `useAutoAlign` compares it against the
  // raw portrait window, and so measures along the wrong axes - flipping the list upward off-screen
  // or running it past the frame's bottom. The host runs its own rotation-aware placement hook
  // (sized with `getProfilePickerContentSize`, passing `open` from its own `host.openId === ...`
  // check) and hands the result in here; `align` above still wins over this result's own `align`.
  // The result's `triggerRef` is the one attached to the measured trigger, so the hook that
  // produced it is measuring the right element. Omit for the default automatic placement.
  alignOverride?: ProfilePickerAlignResult
  // Rotation of an ancestor frame turned by a fake landscape (or equivalent), forwarded to the
  // automatic `useAutoAlign` measurement - the same seam @tastic/hud's InlineColorPicker/
  // SectionedDropdown expose (needs @tastic/hud >= 0.8.0; older versions ignore it). Defaults to 0
  // (measurement used as-is), which is exactly how this picker behaved before this prop existed.
  // Deliberately NOT read from an ambient provider the way hud's own pickers do: this component
  // never touches @tastic/core at runtime, and an ambient read would silently change placement for
  // every existing caller already living under a rotation provider. Ignored when `alignOverride` is
  // supplied (the override replaces the placement this feeds).
  rotation?: PopoverRotation
  // Trigger's own idle-state text (uppercased here regardless of casing passed in) - shown until a
  // profile is selected.
  guestLabel: string
  // The null-selection row's own label/icon - defaults to a generic anonymous-player row, but
  // overridable for a caller where null means something else (e.g. an "All Profiles" combined view
  // reusing this same component for its own picker).
  nullLabel?: string
  nullIcon?: string
  onSelect: (profile: P | null) => void
  // Renders a row for navigating to a dedicated create/rename/delete screen - omit to hide it
  // entirely. This component never manages profiles itself (see ProfilesManager for that); this is
  // selection-only.
  onManage?: () => void
  // Puts a Color row at the top of the popover, above the profile rows, and turns the trigger into
  // one button that leads with a chip: a circle in `color` (the color in effect) with the selected
  // profile's tag (`nullIcon` for the null selection), then the name and the chevron. For a host
  // where the player's color and their profile are one control (Solitaire's Home), instead of a
  // separate color trigger beside the name that read as a different thing. The Color row swaps the
  // popover's contents for the color page (a back row, then the swatches); picking a swatch calls
  // `onChange` and stays on that page, so the change can be seen behind it and another tried. A
  // press away closes the whole popover, and the next open starts on the list again. The selected
  // profile's own color, when it's one of the swatches, carries a small dot while another color is
  // in effect, as the way back to it. Omit for the plain name trigger and a rows-only popover,
  // exactly as before.
  colorSection?: ProfilePickerColorSection
  // Extra style for the trigger (its pressable box) - e.g. a background behind the chip trigger's
  // pill. The chip trigger already pads itself and rounds into a pill.
  triggerStyle?: StyleProp<ViewStyle>
}

// Generic over P (an app's own Profile type, richer than this package's base Profile) so that a
// caller's own onSelect - typed to accept its own richer profile shape - type-checks against the
// objects this component actually hands back, which are always exactly whatever came in through
// `profiles` (see handleSelectExisting below). Without this, TypeScript would only ever let
// onSelect declare the base Profile type, since that's all a non-generic prop signature could
// promise it receives - even though at runtime it always receives the caller's own richer objects.
// ProfileChip doesn't need this same treatment: it only ever takes a profile in, never hands one
// back out, so plain structural covariance already lets a richer object through.
//
// A name trigger + selection popover: pick an existing profile, fall back to a null/"guest"
// selection, or (if onManage is passed) navigate to manage the roster. Creating, renaming, and
// deleting profiles all live outside this component (see ProfilesManager) - this is selection-only,
// both because that keeps this component simple enough to drop into a HUD trigger row, and because
// it keeps this popover from needing its own destructive-delete confirmation. Fully prop-driven -
// no internal profile-storage access of its own, so the host app stays the one place that reads
// its own persistence hook.
export function ProfilePicker<P extends Profile>({ idPrefix, host, profiles, selectedId, takenId, color, dark, align: forcedAlign, alignOverride, rotation = 0, guestLabel, nullLabel = 'Player', nullIcon = 'account-off-outline', onSelect, onManage, colorSection, triggerStyle }: ProfilePickerProps<P>) {
  const id = `${idPrefix}-profile`
  // A selected row fills with the profile's drawn color, the same one its ProfileChip would show.
  const colorPreview = useProfileColorPreview()
  const menuBg = dark ? '#000000' : '#FFFFFF'
  const fg = dark ? '#FFFFFF' : '#000000'

  const open = host.openId === id
  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null
  // Alphabetical - this is the list that sees the most real use, so it's the one that benefits
  // most from staying scannable once there are more than a handful of saved profiles.
  const sortedProfiles = useMemo(() => [...profiles].sort((a, b) => a.name.localeCompare(b.name)), [profiles])
  // Null row + each saved profile + (if passed) the manage row.
  const { width: contentWidth, height: contentHeight } = getProfilePickerContentSize(profiles.length, !!onManage, colorSection)
  // Always called, even when `alignOverride` is supplied and this result goes unused - hooks can't
  // be conditional (see @tastic/hud's InlineColorPicker for the identical pattern). With an
  // override its triggerRef is never attached, so this hook's own measurement is a no-op.
  const auto = useAutoAlign(open, contentWidth, contentHeight, rotation)
  const placement = alignOverride ?? auto
  const { maxHeight, measured, triggerRef, verticalAlign } = placement
  const align = forcedAlign ?? placement.align

  const handleSelectGuest = () => {
    onSelect(null)
    host.close()
  }

  const handleSelectExisting = (profile: P) => {
    if (profile.id === takenId) return
    onSelect(profile)
    host.close()
  }

  const handleManage = () => {
    host.close()
    onManage?.()
  }

  // The chip trigger is a whole pill, so the caret points at its middle: PopoverBody places the
  // caret half a `triggerSize` in from the side the popover is aligned to, so the pill's own width
  // centers it whichever way the popover opens. The plain trigger keeps TRIGGER_HEIGHT, as before.
  const chipTrigger = !!colorSection
  const [triggerWidth, setTriggerWidth] = useState(0)
  const handleAnchorLayout = chipTrigger ? (e: LayoutChangeEvent) => setTriggerWidth(e.nativeEvent.layout.width) : undefined
  // Which page the popover shows. Reset on every press of the trigger, so an open always starts on
  // the list (a press away closes the popover without coming back through here).
  const [colorPage, setColorPage] = useState(false)
  const handleTriggerPress = () => {
    setColorPage(false)
    host.toggle(id)
  }
  const triggerLabel = (selectedProfile?.name ?? guestLabel).toUpperCase()
  // Shown on the list page only (see the footer below).
  const manageFooter = !!onManage && !(colorSection && colorPage)

  return (
    <View style={[styles.anchor, open && styles.anchorOpen]} onLayout={handleAnchorLayout}>
      <TouchableRipple onPress={handleTriggerPress} borderless={chipTrigger} style={[styles.trigger, chipTrigger && styles.chipTrigger, triggerStyle]} accessibilityRole='button' accessibilityLabel={triggerLabel}>
        <View ref={triggerRef} collapsable={false} style={chipTrigger ? styles.chipTriggerInner : styles.triggerInner}>
          {chipTrigger && <IdentityChip color={color} tag={selectedProfile?.tag} icon={selectedProfile ? 'account' : nullIcon} size={CHIP_SIZE} />}
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
          <FadingScrollView key={colorSection && colorPage ? 'color' : 'list'} contentContainerStyle={[styles.menuContent, manageFooter && styles.menuContentAboveFooter]} showsVerticalScrollIndicator={false}>
            {colorSection && colorPage ? (
              <ColorPage section={colorSection} profileColor={selectedProfile?.color} fg={fg} onBack={() => setColorPage(false)} />
            ) : (
              <>
                {colorSection && <ColorRow section={colorSection} fg={fg} dividerColor={color} onPress={() => setColorPage(true)} />}
                {/* Selected row's own background fills entirely with its identity color (this seat's own
                accent for the null row, the profile's own saved color otherwise) - matching how a
                selected row reads elsewhere (see @tastic/hud's SectionedDropdown) rather than a checkmark
                bolted onto an otherwise-plain row. */}
                <TouchableRipple onPress={handleSelectGuest} style={[styles.row, selectedId === null && { backgroundColor: color }]}>
                  <View style={styles.rowInner}>
                    {/* Unfilled, matching a selected profile row's own ProfileChip treatment - no
                    background circle, but still the same fixed-size slot every row's icon/chip sits in
                    (see ProfileChip's own doc), so this row's icon stays lined up with every other row
                    regardless of selection. */}
                    <View style={styles.guestChip}>
                      <Icon source={nullIcon} size={13} color={selectedId === null ? getContrastColor(color) : fg} />
                    </View>
                    <Text style={[styles.rowLabel, { color: selectedId === null ? getContrastColor(color) : fg }]}>{nullLabel}</Text>
                  </View>
                </TouchableRipple>

                {sortedProfiles.map((profile) => {
                  const taken = profile.id === takenId
                  const selected = selectedId === profile.id
                  const rowColor = colorPreview ? colorPreview(profile.color) : profile.color
                  return (
                    <TouchableRipple key={profile.id} disabled={taken} onPress={() => handleSelectExisting(profile)} style={[styles.row, selected && { backgroundColor: rowColor }]}>
                      <View style={[styles.rowInner, taken && styles.rowDisabled]}>
                        {/* Unfilled on a selected row - its own background already fills with the
                        profile's color, so a second circle behind the tag would just be a redundant badge
                        where every other selected row in the app has plain icon+text instead. */}
                        <ProfileChip profile={profile} filled={!selected} />
                        <Text
                          style={[
                            styles.rowLabel,
                            {
                              color: selected ? getContrastColor(rowColor) : fg
                            }
                          ]}
                          numberOfLines={1}
                        >
                          {profile.name}
                        </Text>
                      </View>
                    </TouchableRipple>
                  )
                })}
              </>
            )}
          </FadingScrollView>
          {/* Manage is pinned below the scrolling rows, the way a dialog's Done sits below its rows:
          always reachable, with the rows fading out above its divider while there are more below
          (2026-10-16; it used to be the list's last row and scrolled away with it). Tertiary - a
          navigation action, not another selectable identity in the list above it, so it reads more
          like @tastic/hud's SectionedDropdown All/Clear footer button (centered, bold) than a normal
          row. The accent is on the icon only: a muted accent label on the menu's black read dim,
          almost disabled. Not on the color page, which only has the back row and the swatches. */}
          {manageFooter && (
            <View style={styles.menuFooter}>
              <View style={[styles.divider, { backgroundColor: color }]} />
              <TouchableRipple onPress={handleManage} style={styles.row}>
                <View style={styles.manageRowInner}>
                  <Icon source='account-cog-outline' size={16} color={color} />
                  <Text style={[styles.manageLabel, { color: fg }]}>Manage</Text>
                </View>
              </TouchableRipple>
            </View>
          )}
        </View>
      </PopoverBody>
    </View>
  )
}

// The color section's heading, caption and swatch grid, then a divider before the profile rows.
// The list page's top row: a swatch of the color in effect, the label (and caption), and a chevron
// to the color page. A divider sets it apart from the selectable rows under it.
function ColorRow({ section, fg, dividerColor, onPress }: { section: ProfilePickerColorSection; fg: string; dividerColor: string; onPress: () => void }) {
  const { value, previewValue, label = 'Color', caption } = section
  const drawn = previewValue ? previewValue(value) : value
  return (
    <>
      <TouchableRipple onPress={onPress} style={[styles.row, { height: colorRowHeight(caption) }]} accessibilityRole='button' accessibilityLabel={caption ? `${label}, ${caption}` : label}>
        <View style={styles.rowInner}>
          <View style={[styles.colorRowSwatch, { backgroundColor: drawn }]} />
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

// The color page: a back row to the list, then the swatches. `profileColor` is the selected
// profile's own color: its swatch carries a dot, so a player who has picked something else can find
// their way back to it (the profile's row shows that color, but matching it to one of two similar
// swatches by eye is guesswork). The check takes the dot's place on the swatch in effect, so the
// dot only shows while the color in effect is another one.
function ColorPage({ section, profileColor, fg, onBack }: { section: ProfilePickerColorSection; profileColor?: string; fg: string; onBack: () => void }) {
  const { value, onChange, previewValue, swatches = defaultColors, label = 'Color' } = section
  const displayFor = previewValue ?? ((hex: string) => hex)
  return (
    <>
      <TouchableRipple onPress={onBack} style={styles.row} accessibilityRole='button' accessibilityLabel='Back'>
        <View style={styles.rowInner}>
          <View style={styles.guestChip}>
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
          const isProfileColor = !!profileColor && swatch.value.toLowerCase() === profileColor.toLowerCase()
          const swatchDisplay = displayFor(swatch.value)
          // The same swatch as @tastic/hud's InlineColorPicker: a filled circle, the selected one
          // ringed and checked.
          return (
            <TouchableRipple key={swatch.value} onPress={() => onChange(swatch.value)} borderless style={[styles.swatch, { backgroundColor: swatchDisplay }, selected && styles.swatchSelected]} accessibilityRole='button' accessibilityLabel={isProfileColor ? `${swatch.label}, profile color` : swatch.label} accessibilityState={{ selected }}>
              {selected ? <Icon source='check' size={16} color={getContrastColor(swatchDisplay)} /> : isProfileColor ? <View style={[styles.profileDot, { backgroundColor: getContrastColor(swatchDisplay) }]} /> : <View />}
            </TouchableRipple>
          )
        })}
      </View>
    </>
  )
}

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
    borderRadius: 11,
    height: 22,
    width: 22
  },
  colorRowText: {
    flex: 1
  },
  // Separates Manage (a navigation action) from the selectable rows above it - different kind of
  // action, not just another row in the same list. Tinted with the seat's own color (passed in as
  // backgroundColor) rather than a flat gray, matching the border/caret's own accent-tinted look.
  divider: {
    height: 1,
    marginVertical: 4,
    opacity: 0.25
  },
  // Matches ProfileChip's own default size/shape exactly (see this row's own render-site comment)
  // - no backgroundColor, unlike ProfileChip's own default: this row has no identity color of its
  // own to fill it with, and the render site now colors the icon directly instead.
  guestChip: {
    alignItems: 'center',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    width: 22
  },
  manageLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  // Centered rather than left-aligned like a normal row - see this row's own render-site comment
  // for why (a footer action, not another selectable identity).
  manageRowInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    height: '100%',
    justifyContent: 'center'
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
  // With Manage pinned below, its own padding takes the bottom edge (same total height as before).
  menuContentAboveFooter: {
    paddingBottom: 0
  },
  menuFooter: {
    paddingBottom: LIST_PADDING,
    paddingHorizontal: LIST_PADDING
  },
  // The selected profile's own color (see ColorSection).
  profileDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
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
  },
  swatch: {
    alignItems: 'center',
    borderRadius: SWATCH_SIZE / 2,
    height: SWATCH_SIZE,
    justifyContent: 'center',
    width: SWATCH_SIZE
  },
  swatchSelected: {
    borderColor: '#ffffff',
    borderWidth: 2
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
