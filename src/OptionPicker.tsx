import type { PopoverHost } from '@tastic/hud/chrome'
import { Fragment, useState } from 'react'
import { type StyleProp, type ViewStyle } from 'react-native'

import { BackRow, IconRow, MenuDivider, pickerContentSize, PickerMenu, type ProfilePickerAlignResult, type ProfilePickerColorSection, type ProfilePickerContentSize } from './PickerMenu'

export interface OptionPickerOption<T extends string> {
  value: T
  label: string
  icon?: string
  // The option's own color (e.g. a difficulty's), for its row's icon while the row isn't the selected
  // one; the selected row still fills with the picker's `color`, its icon contrasting as always.
  // Without it the icon takes the row's text color.
  color?: string
  // A divider above this row, setting it and the rows after it apart from the ones before as a
  // different kind of choice (a person after a CPU's levels). Ignored on the first option, which the
  // Color row's own divider, or nothing, already sits above.
  dividerBefore?: boolean
  // What the pill says while this option is picked, where its row's label alone wouldn't do: a group's
  // "All" row, which the pill names by its group ("Two Player"). Its label otherwise.
  triggerLabel?: string
  // A group: a row with a chevron that swaps the menu for a page of these options under a back row,
  // as the Color row does (a stats screen's games, Solitaire and Two Player). A group's own `value` is
  // never picked: its row fills while the option picked is one of its own.
  options?: OptionPickerOption<T>[]
}

function hasDividerBefore(option: OptionPickerOption<string>, index: number): boolean {
  return index > 0 && !!option.dividerBefore
}

// The option picked, anywhere in the groups.
function findOption<T extends string>(options: readonly OptionPickerOption<T>[], value: T): OptionPickerOption<T> | undefined {
  for (const option of options) {
    if (option.value === value) return option
    const inGroup = option.options && findOption(option.options, value)
    if (inGroup) return inGroup
  }
  return undefined
}

// The popover's content footprint: one row per option and its dividers, plus (with a
// `colorSection`) the Color row, or the color page if that's taller - the same formula as
// getProfilePickerContentSize, for a host that places this picker itself through `alignOverride` (a
// @tastic/split-screen zone's useZoneClampedAlign, for one). Given the options themselves it counts
// their dividers too, and a group's page (its back row and its options) where that's taller; given a
// count, rows only.
export function getOptionPickerContentSize(options: number | readonly OptionPickerOption<string>[], colorSection?: Pick<ProfilePickerColorSection, 'swatches' | 'caption'>): ProfilePickerContentSize {
  if (typeof options === 'number') return pickerContentSize(options, colorSection)
  const list = pickerContentSize(options.length, colorSection, options.filter(hasDividerBefore).length)
  return options.reduce((size, option) => {
    if (!option.options) return size
    const page = pickerContentSize(option.options.length + 1, undefined, option.options.filter(hasDividerBefore).length)
    return page.height > size.height ? page : size
  }, list)
}

interface OptionPickerProps<T extends string> {
  // The popover id this trigger toggles on `host`.
  id: string
  host: PopoverHost
  options: OptionPickerOption<T>[]
  value: T
  onChange: (value: T) => void
  // The seat's live color: the chip, the menu's border and caret, and the selected row's fill.
  color: string
  dark: boolean
  // The chip's glyph (e.g. a robot for a CPU seat).
  icon: string
  // A small line over the selected option's label naming what the pill picks (PickerMenu's `caption`).
  caption?: string
  // An option without its own icon falls back to this one in its row. Defaults to `icon`.
  rowIcon?: string
  // The same Color row and page as ProfilePicker's `colorSection`.
  colorSection?: ProfilePickerColorSection
  // See ProfilePicker's own props of the same names.
  align?: 'left' | 'right' | 'center'
  alignOverride?: ProfilePickerAlignResult
  // The pill's own style (a background), as ProfilePicker's; a `flexShrink` lets it give way in a
  // narrow row, cutting its label off.
  triggerStyle?: StyleProp<ViewStyle>
}

// ProfilePicker's chip button and dropdown for a seat with no profile: a list of options (a CPU
// seat's difficulties) under the same Color row, so a CPU seat is the same one control as a
// player's. The button leads with a chip in `color` with `icon`, then the selected option's label
// and a chevron. Picking an option closes the dropdown; the Color row works exactly as it does in
// ProfilePicker (picking a swatch stays on the color page). An option with `options` of its own is a
// group, opening a page of them behind a back row; the dropdown always opens on the top list.
export function OptionPicker<T extends string>({ id, host, options, value, onChange, color, dark, icon, caption, rowIcon = icon, colorSection, align, alignOverride, triggerStyle }: OptionPickerProps<T>) {
  const fg = dark ? '#FFFFFF' : '#000000'
  const selected = findOption(options, value)
  const open = host.openId === id

  // The group whose page is showing, back to the top list whenever the dropdown closes (by a pick, or a press away)
  const [groupValue, setGroupValue] = useState<T | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) setGroupValue(null)
  }
  const group = groupValue === null ? null : (options.find((option) => option.value === groupValue && option.options) ?? null)

  const handleSelect = (option: OptionPickerOption<T>) => {
    onChange(option.value)
    host.close()
  }
  const rows = (list: OptionPickerOption<T>[]) =>
    list.map((option, index) => (
      <Fragment key={option.value}>
        {hasDividerBefore(option, index) && <MenuDivider color={color} />}
        {option.options ? <IconRow icon={option.icon ?? rowIcon} iconColor={option.color} label={option.label} selected={!!findOption(option.options, value)} color={color} fg={fg} trailing='chevron-right' onPress={() => setGroupValue(option.value)} /> : <IconRow icon={option.icon ?? rowIcon} iconColor={option.color} label={option.label} selected={option.value === value} color={color} fg={fg} onPress={() => handleSelect(option)} />}
      </Fragment>
    ))

  return (
    <PickerMenu id={id} host={host} color={color} dark={dark} label={selected?.triggerLabel ?? selected?.label ?? ''} caption={caption} chip={{ icon }} colorSection={group ? undefined : colorSection} contentSize={getOptionPickerContentSize(options, colorSection)} align={align} alignOverride={alignOverride} triggerStyle={triggerStyle} pageKey={group ? group.value : undefined}>
      {group ? (
        <>
          <BackRow label={group.label} fg={fg} onPress={() => setGroupValue(null)} />
          {rows(group.options!)}
        </>
      ) : (
        rows(options)
      )}
    </PickerMenu>
  )
}
