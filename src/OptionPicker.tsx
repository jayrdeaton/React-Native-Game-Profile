import type { PopoverHost, PopoverRotation } from '@tastic/hud/chrome'
import { Fragment } from 'react'
import { type StyleProp, type ViewStyle } from 'react-native'

import { IconRow, MenuDivider, pickerContentSize, PickerMenu, type ProfilePickerAlignResult, type ProfilePickerColorSection, type ProfilePickerContentSize } from './PickerMenu'

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
}

function hasDividerBefore(option: OptionPickerOption<string>, index: number): boolean {
  return index > 0 && !!option.dividerBefore
}

// The popover's content footprint: one row per option and its dividers, plus (with a
// `colorSection`) the Color row, or the color page if that's taller - the same formula as
// getProfilePickerContentSize, for a host that places this picker itself through `alignOverride` (a
// @tastic/split-screen zone's useZoneClampedAlign, for one). Given the options themselves it counts
// their dividers too; given a count, rows only.
export function getOptionPickerContentSize(options: number | readonly OptionPickerOption<string>[], colorSection?: Pick<ProfilePickerColorSection, 'swatches' | 'caption'>): ProfilePickerContentSize {
  if (typeof options === 'number') return pickerContentSize(options, colorSection)
  return pickerContentSize(options.length, colorSection, options.filter(hasDividerBefore).length)
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
  // An option without its own icon falls back to this one in its row. Defaults to `icon`.
  rowIcon?: string
  // The same Color row and page as ProfilePicker's `colorSection`.
  colorSection?: ProfilePickerColorSection
  // See ProfilePicker's own props of the same names.
  align?: 'left' | 'right' | 'center'
  alignOverride?: ProfilePickerAlignResult
  rotation?: PopoverRotation
  // The pill's own style (a background), as ProfilePicker's; a `flexShrink` lets it give way in a
  // narrow row, cutting its label off.
  triggerStyle?: StyleProp<ViewStyle>
}

// ProfilePicker's chip button and dropdown for a seat with no profile: a list of options (a CPU
// seat's difficulties) under the same Color row, so a CPU seat is the same one control as a
// player's. The button leads with a chip in `color` with `icon`, then the selected option's label
// and a chevron. Picking an option closes the dropdown; the Color row works exactly as it does in
// ProfilePicker (picking a swatch stays on the color page).
export function OptionPicker<T extends string>({ id, host, options, value, onChange, color, dark, icon, rowIcon = icon, colorSection, align, alignOverride, rotation = 0, triggerStyle }: OptionPickerProps<T>) {
  const fg = dark ? '#FFFFFF' : '#000000'
  const selected = options.find((option) => option.value === value)

  const handleSelect = (option: OptionPickerOption<T>) => {
    onChange(option.value)
    host.close()
  }

  return (
    <PickerMenu id={id} host={host} color={color} dark={dark} label={selected?.label ?? ''} chip={{ icon }} colorSection={colorSection} contentSize={getOptionPickerContentSize(options, colorSection)} align={align} alignOverride={alignOverride} rotation={rotation} triggerStyle={triggerStyle}>
      {options.map((option, index) => (
        <Fragment key={option.value}>
          {hasDividerBefore(option, index) && <MenuDivider color={color} />}
          <IconRow icon={option.icon ?? rowIcon} iconColor={option.color} label={option.label} selected={option.value === value} color={color} fg={fg} onPress={() => handleSelect(option)} />
        </Fragment>
      ))}
    </PickerMenu>
  )
}
