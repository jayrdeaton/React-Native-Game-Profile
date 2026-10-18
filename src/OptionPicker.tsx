import type { PopoverHost, PopoverRotation } from '@tastic/hud/chrome'
import { type StyleProp, type ViewStyle } from 'react-native'

import { IconRow, pickerContentSize, PickerMenu, type ProfilePickerAlignResult, type ProfilePickerColorSection, type ProfilePickerContentSize } from './PickerMenu'

export interface OptionPickerOption<T extends string> {
  value: T
  label: string
  icon?: string
  // The option's own color (e.g. a difficulty's), for its row's icon while the row isn't the selected
  // one; the selected row still fills with the picker's `color`, its icon contrasting as always.
  // Without it the icon takes the row's text color.
  color?: string
}

// The popover's content footprint: one row per option, plus (with a `colorSection`) the Color row,
// or the color page if that's taller - the same formula as getProfilePickerContentSize, for a host
// that places this picker itself through `alignOverride` (a @tastic/split-screen zone's
// useZoneClampedAlign, for one).
export function getOptionPickerContentSize(optionCount: number, colorSection?: Pick<ProfilePickerColorSection, 'swatches' | 'caption'>): ProfilePickerContentSize {
  return pickerContentSize(optionCount, colorSection)
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
    <PickerMenu id={id} host={host} color={color} dark={dark} label={selected?.label ?? ''} chip={{ icon }} colorSection={colorSection} contentSize={getOptionPickerContentSize(options.length, colorSection)} align={align} alignOverride={alignOverride} rotation={rotation} triggerStyle={triggerStyle}>
      {options.map((option) => (
        <IconRow key={option.value} icon={option.icon ?? rowIcon} iconColor={option.color} label={option.label} selected={option.value === value} color={color} fg={fg} onPress={() => handleSelect(option)} />
      ))}
    </PickerMenu>
  )
}
