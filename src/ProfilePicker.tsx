import { getContrastColor } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import { PopoverHost, PopoverRotation } from '@tastic/hud'
import { useMemo } from 'react'
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { Icon, Text } from 'react-native-paper'

import { IconRow, pickerContentSize, PickerMenu, pickerMenuStyles, type ProfilePickerAlignResult, type ProfilePickerColorSection, type ProfilePickerContentSize } from './PickerMenu'
import { ProfileChip } from './ProfileChip'
import { useProfileColorPreview } from './ProfileColorContext'
import { Profile } from './types'

export type { ProfilePickerAlignResult, ProfilePickerColorSection, ProfilePickerContentSize } from './PickerMenu'

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
  return pickerContentSize(profileCount + 1 + (hasManageRow ? 1 : 0), colorSection)
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
export function ProfilePicker<P extends Profile>({ idPrefix, host, profiles, selectedId, takenId, color, dark, align, alignOverride, rotation = 0, guestLabel, nullLabel = 'Player', nullIcon = 'account-off-outline', onSelect, onManage, colorSection, triggerStyle }: ProfilePickerProps<P>) {
  const id = `${idPrefix}-profile`
  // A selected row fills with the profile's drawn color, the same one its ProfileChip would show.
  const colorPreview = useProfileColorPreview()
  const fg = dark ? '#FFFFFF' : '#000000'

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null
  // Alphabetical - this is the list that sees the most real use, so it's the one that benefits
  // most from staying scannable once there are more than a handful of saved profiles.
  const sortedProfiles = useMemo(() => [...profiles].sort((a, b) => a.name.localeCompare(b.name)), [profiles])
  // Null row + each saved profile + (if passed) the manage row.
  const contentSize = getProfilePickerContentSize(profiles.length, !!onManage, colorSection)

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

  // Manage is pinned below the scrolling rows, the way a dialog's Done sits below its rows: always
  // reachable, with the rows fading out above its divider while there are more below (2026-10-16;
  // it used to be the list's last row and scrolled away with it). Tertiary - a navigation action,
  // not another selectable identity in the list above it, so it reads more like @tastic/hud's
  // SectionedDropdown All/Clear footer button (centered, bold) than a normal row. The accent is on
  // the icon only: a muted accent label on the menu's black read dim, almost disabled.
  const manageFooter = onManage ? (
    <TouchableRipple onPress={handleManage} style={pickerMenuStyles.row}>
      <View style={styles.manageRowInner}>
        <Icon source='account-cog-outline' size={16} color={color} />
        <Text style={[styles.manageLabel, { color: fg }]}>Manage</Text>
      </View>
    </TouchableRipple>
  ) : undefined

  return (
    <PickerMenu id={id} host={host} color={color} dark={dark} label={selectedProfile?.name ?? guestLabel} chip={colorSection ? { tag: selectedProfile?.tag, icon: selectedProfile ? 'account' : nullIcon } : undefined} colorSection={colorSection} homeColor={selectedProfile?.color} contentSize={contentSize} align={align} alignOverride={alignOverride} rotation={rotation} triggerStyle={triggerStyle} footer={manageFooter}>
      <IconRow icon={nullIcon} label={nullLabel} selected={selectedId === null} color={color} fg={fg} onPress={handleSelectGuest} />

      {sortedProfiles.map((profile) => {
        const taken = profile.id === takenId
        const selected = selectedId === profile.id
        const rowColor = colorPreview ? colorPreview(profile.color) : profile.color
        return (
          <TouchableRipple key={profile.id} disabled={taken} onPress={() => handleSelectExisting(profile)} style={[pickerMenuStyles.row, selected && { backgroundColor: rowColor }]}>
            <View style={[pickerMenuStyles.rowInner, taken && pickerMenuStyles.rowDisabled]}>
              {/* Unfilled on a selected row - its own background already fills with the
              profile's color, so a second circle behind the tag would just be a redundant badge
              where every other selected row in the app has plain icon+text instead. */}
              <ProfileChip profile={profile} filled={!selected} />
              <Text
                style={[
                  pickerMenuStyles.rowLabel,
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
    </PickerMenu>
  )
}

const styles = StyleSheet.create({
  manageLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  // Centered rather than left-aligned like a normal row - see the footer's own comment for why (a
  // footer action, not another selectable identity).
  manageRowInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    height: '100%',
    justifyContent: 'center'
  }
})
