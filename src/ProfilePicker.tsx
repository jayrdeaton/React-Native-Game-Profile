import { getContrastColor } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import { PopoverBody, PopoverHost, useAutoAlign } from '@tastic/hud'
import { useMemo } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Icon, Text } from 'react-native-paper'

import { ProfileChip } from './ProfileChip'
import { Profile } from './types'

const TRIGGER_HEIGHT = 28
const POPOVER_WIDTH = 220
const ROW_HEIGHT = 36
const LIST_PADDING = 8

interface ProfilePickerProps<P extends Profile> {
  // Namespaces this trigger's id — pass something unique per instance whenever more than one of
  // these shares a PopoverHost (e.g. one per seat).
  idPrefix: string
  // The host this trigger's popover opens against — share one host across sibling pickers (a
  // seat's color/tag/profile triggers) so opening one closes any other in the same group.
  host: PopoverHost
  profiles: P[]
  selectedId: string | null
  // Another picker's currently-selected profile id, if any — disabled in this list. Useful when a
  // profile shouldn't be selectable in two places at once (e.g. two seats in a local-multiplayer
  // game, where double-selecting one profile would double-count its stats as both winner and
  // loser) — omit if that doesn't apply.
  takenId?: string | null
  // Tint for the trigger's own label/icon — pass the seat/context's current live color so the
  // trigger reads as one identity with whatever it's paired with.
  color: string
  dark: boolean
  align?: 'left' | 'right' | 'center'
  // Trigger's own idle-state text (uppercased here regardless of casing passed in) — shown until a
  // profile is selected.
  guestLabel: string
  // The null-selection row's own label/icon — defaults to a generic anonymous-player row, but
  // overridable for a caller where null means something else (e.g. an "All Profiles" combined view
  // reusing this same component for its own picker).
  nullLabel?: string
  nullIcon?: string
  onSelect: (profile: P | null) => void
  // Renders a row for navigating to a dedicated create/rename/delete screen — omit to hide it
  // entirely. This component never manages profiles itself (see ProfilesManager for that); this is
  // selection-only.
  onManage?: () => void
}

// Generic over P (an app's own Profile type, richer than this package's base Profile) so that a
// caller's own onSelect — typed to accept its own richer profile shape — type-checks against the
// objects this component actually hands back, which are always exactly whatever came in through
// `profiles` (see handleSelectExisting below). Without this, TypeScript would only ever let
// onSelect declare the base Profile type, since that's all a non-generic prop signature could
// promise it receives — even though at runtime it always receives the caller's own richer objects.
// ProfileChip doesn't need this same treatment: it only ever takes a profile in, never hands one
// back out, so plain structural covariance already lets a richer object through.
//
// A name trigger + selection popover: pick an existing profile, fall back to a null/"guest"
// selection, or (if onManage is passed) navigate to manage the roster. Creating, renaming, and
// deleting profiles all live outside this component (see ProfilesManager) — this is selection-only,
// both because that keeps this component simple enough to drop into a HUD trigger row, and because
// it keeps this popover from needing its own destructive-delete confirmation. Fully prop-driven —
// no internal profile-storage access of its own, so the host app stays the one place that reads
// its own persistence hook.
export function ProfilePicker<P extends Profile>({ idPrefix, host, profiles, selectedId, takenId, color, dark, align: alignOverride, guestLabel, nullLabel = 'Player', nullIcon = 'account-off-outline', onSelect, onManage }: ProfilePickerProps<P>) {
  const id = `${idPrefix}-profile`
  const menuBg = dark ? '#000000' : '#FFFFFF'
  const fg = dark ? '#FFFFFF' : '#000000'

  const open = host.openId === id
  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null
  // Alphabetical — this is the list that sees the most real use, so it's the one that benefits
  // most from staying scannable once there are more than a handful of saved profiles.
  const sortedProfiles = useMemo(() => [...profiles].sort((a, b) => a.name.localeCompare(b.name)), [profiles])
  // Null row + each saved profile + (if passed) the manage row.
  const rowCount = profiles.length + 1 + (onManage ? 1 : 0)
  const contentHeight = LIST_PADDING * 2 + rowCount * ROW_HEIGHT
  const { align: autoAlign, maxHeight, measured, triggerRef, verticalAlign } = useAutoAlign(open, POPOVER_WIDTH, contentHeight)
  const align = alignOverride ?? autoAlign

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

  return (
    <View style={[styles.anchor, open && styles.anchorOpen]}>
      <TouchableRipple onPress={() => host.toggle(id)} style={styles.trigger}>
        <View ref={triggerRef} collapsable={false} style={styles.triggerInner}>
          <Text style={[styles.triggerLabel, { color }]} numberOfLines={1}>
            {(selectedProfile?.name ?? guestLabel).toUpperCase()}
          </Text>
          <Icon source='menu-down' size={16} color={color} />
        </View>
      </TouchableRipple>

      {/* Gated on `measured`, not just `open` — see InlineColorPicker's identical fix. */}
      <PopoverBody visible={open && measured} align={align} verticalAlign={verticalAlign} caretColor={menuBg} caretBorderColor={color} caretBorderWidth={2} triggerSize={TRIGGER_HEIGHT}>
        <ScrollView
          style={[
            styles.menu,
            {
              backgroundColor: menuBg,
              borderColor: color,
              width: POPOVER_WIDTH,
              maxHeight
            }
          ]}
          contentContainerStyle={styles.menuContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Selected row's own background fills entirely with its identity color (this seat's own
          accent for the null row, the profile's own saved color otherwise) — matching how a
          selected row reads elsewhere (see @tastic/hud's SectionedDropdown) rather than a checkmark
          bolted onto an otherwise-plain row. */}
          <TouchableRipple onPress={handleSelectGuest} style={[styles.row, selectedId === null && { backgroundColor: color }]}>
            <View style={styles.rowInner}>
              {/* Unfilled, matching a selected profile row's own ProfileChip treatment — no
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
            return (
              <TouchableRipple key={profile.id} disabled={taken} onPress={() => handleSelectExisting(profile)} style={[styles.row, selected && { backgroundColor: profile.color }]}>
                <View style={[styles.rowInner, taken && styles.rowDisabled]}>
                  {/* Unfilled on a selected row — its own background already fills with the
                  profile's color, so a second circle behind the tag would just be a redundant badge
                  where every other selected row in the app has plain icon+text instead. */}
                  <ProfileChip profile={profile} filled={!selected} />
                  <Text
                    style={[
                      styles.rowLabel,
                      {
                        color: selected ? getContrastColor(profile.color) : fg
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

          {onManage && (
            <>
              <View style={[styles.divider, { backgroundColor: color }]} />
              {/* Tertiary — a navigation action, not another selectable identity in the list above
              it, so it reads more like @tastic/hud's SectionedDropdown All/Clear footer button
              (centered, bold, accent-colored) than a normal row. */}
              <TouchableRipple onPress={handleManage} style={styles.row}>
                <View style={styles.manageRowInner}>
                  <Icon source='account-cog-outline' size={16} color={color} />
                  <Text style={[styles.manageLabel, { color }]}>Manage</Text>
                </View>
              </TouchableRipple>
            </>
          )}
        </ScrollView>
      </PopoverBody>
    </View>
  )
}

const styles = StyleSheet.create({
  anchor: {
    position: 'relative'
  },
  // See InlineColorPicker's identical comment — React Native Web gives every position:'relative'
  // view its own stacking context, so the elevation has to live on the anchor itself.
  anchorOpen: {
    zIndex: 100
  },
  // Separates Manage (a navigation action) from the selectable rows above it — different kind of
  // action, not just another row in the same list. Tinted with the seat's own color (passed in as
  // backgroundColor) rather than a flat gray, matching the border/caret's own accent-tinted look.
  divider: {
    height: 1,
    marginVertical: 4,
    opacity: 0.25
  },
  // Matches ProfileChip's own default size/shape exactly (see this row's own render-site comment)
  // — no backgroundColor, unlike ProfileChip's own default: this row has no identity color of its
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
  // Centered rather than left-aligned like a normal row — see this row's own render-site comment
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
    borderWidth: 2,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8
  },
  // Padded on every side (not just top/bottom) — a selected row's own full-color background (see
  // `row`'s borderRadius) needs real margin from the menu's own straight edges to read as a rounded
  // pill instead of looking clipped against them.
  menuContent: {
    padding: LIST_PADDING
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
    paddingHorizontal: 12
  },
  rowLabel: {
    flex: 1,
    fontSize: 14
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
