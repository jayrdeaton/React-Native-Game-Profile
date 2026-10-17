import { TouchableRipple } from '@rific/feedback-press'
import type { PopoverHost } from '@tastic/hud/chrome'
import { useAutoAlign } from '@tastic/hud/chrome'
import { act, render } from '@testing-library/react'
import { Icon, Text } from 'react-native-paper'

import { IdentityChip } from '../IdentityChip'
import { getOptionPickerContentSize, OptionPicker, OptionPickerOption } from '../OptionPicker'
import { getProfilePickerContentSize, ProfilePickerAlignResult, ProfilePickerColorSection } from '../ProfilePicker'

// The same stand-ins as ProfilePicker.test.tsx (see its comment for why each peer is mocked).
jest.mock('@rific/auto-paper', () => ({
  getContrastColor: jest.fn((color: string) => `contrast(${color})`),
  defaultColors: Array.from({ length: 20 }, (_, i) => ({ label: `Color ${i}`, value: `#0000${i.toString(16).padStart(2, '0')}` })),
  FadingScrollView: jest.fn((props: { children?: unknown }) => props.children ?? null)
}))

jest.mock('@rific/feedback-press', () => ({
  TouchableRipple: jest.fn((props: { children?: unknown }) => props.children ?? null)
}))

jest.mock('@tastic/hud/chrome', () => ({
  PopoverBody: jest.fn((props: { visible?: boolean; children?: unknown }) => (props.visible ? (props.children ?? null) : null)),
  useAutoAlign: jest.fn(() => ({
    align: 'center',
    maxHeight: 400,
    measured: true,
    triggerRef: { current: null },
    verticalAlign: 'below'
  }))
}))

jest.mock('../IdentityChip', () => ({
  IdentityChip: jest.fn(() => null)
}))

const mockTouchableRipple = TouchableRipple as unknown as jest.Mock
const mockUseAutoAlign = useAutoAlign as unknown as jest.Mock
const mockIdentityChip = IdentityChip as unknown as jest.Mock
const mockIcon = Icon as unknown as jest.Mock
const mockText = Text as unknown as jest.Mock

type Level = 'easy' | 'normal' | 'hard'
const OPTIONS: OptionPickerOption<Level>[] = [
  { value: 'easy', label: 'Garter', icon: 'emoticon-happy-outline' },
  { value: 'normal', label: 'Rattler' },
  { value: 'hard', label: 'King Cobra', icon: 'fire' }
]
const ID = 'p2-difficulty'

const makeHost = (openId: string | null) => ({ openId, toggle: jest.fn(), close: jest.fn() }) as PopoverHost & { toggle: jest.Mock; close: jest.Mock }

interface Overrides {
  host?: ReturnType<typeof makeHost>
  value?: Level
  onChange?: (value: Level) => void
  colorSection?: ProfilePickerColorSection
  alignOverride?: ProfilePickerAlignResult
  rotation?: 0 | 90 | -90 | 180
  dark?: boolean
}

function renderPicker(overrides: Overrides = {}) {
  const host = overrides.host ?? makeHost(null)
  const onChange = overrides.onChange ?? jest.fn()
  render(<OptionPicker id={ID} host={host} options={OPTIONS} value={overrides.value ?? 'normal'} onChange={onChange} color='#123456' dark={overrides.dark ?? true} icon='robot' colorSection={overrides.colorSection} alignOverride={overrides.alignOverride} rotation={overrides.rotation} />)
  return { host, onChange }
}

const texts = () => mockText.mock.calls.map((call) => (call[0] as { children?: unknown }).children)

describe('OptionPicker', () => {
  beforeEach(() => jest.clearAllMocks())

  it("is the chip button: the seat's color and icon, then the selected option's label, uppercased", () => {
    renderPicker({ value: 'hard' })
    expect(mockIdentityChip).toHaveBeenCalledWith(expect.objectContaining({ color: '#123456', icon: 'robot', tag: undefined, size: 32 }), undefined)
    expect(texts()[0]).toBe('KING COBRA')
  })

  it("toggles its own id on the host and draws no rows while it's closed", () => {
    const { host } = renderPicker()
    expect(texts()).toEqual(['RATTLER'])
    ;(mockTouchableRipple.mock.calls[0][0] as { onPress: () => void }).onPress()
    expect(host.toggle).toHaveBeenCalledWith(ID)
  })

  it("lists every option with its own icon, or the chip's icon for one without", () => {
    renderPicker({ host: makeHost(ID) })
    expect(texts()).toEqual(['RATTLER', 'Garter', 'Rattler', 'King Cobra'])
    const rowIcons = mockIcon.mock.calls.map((call) => (call[0] as { source: string }).source).filter((source) => source !== 'menu-down')
    expect(rowIcons).toEqual(['emoticon-happy-outline', 'robot', 'fire'])
  })

  it('fills the selected row with the seat color', () => {
    renderPicker({ host: makeHost(ID), value: 'easy' })
    // calls: [0] trigger, then one per option.
    expect(mockTouchableRipple.mock.calls[1][0].style).toContainEqual({ backgroundColor: '#123456' })
    expect(mockTouchableRipple.mock.calls[2][0].style).not.toContainEqual({ backgroundColor: '#123456' })
  })

  it('commits the option and closes the dropdown on a row press', () => {
    const { host, onChange } = renderPicker({ host: makeHost(ID) })
    act(() => (mockTouchableRipple.mock.calls[3][0] as { onPress: () => void }).onPress())
    expect(onChange).toHaveBeenCalledWith('hard')
    expect(host.close).toHaveBeenCalledTimes(1)
  })

  it("puts the Color row above the options, opening the same color page as ProfilePicker's", () => {
    const onChange = jest.fn()
    renderPicker({ host: makeHost(ID), colorSection: { value: '#000003', onChange, takenValue: '#000009', allowSwapTaken: true } })
    expect(texts().indexOf('Color')).toBeLessThan(texts().indexOf('Garter'))
    const colorRow = mockTouchableRipple.mock.calls.map((call) => call[0] as { accessibilityLabel?: string; onPress?: () => void }).find((props) => props.accessibilityLabel === 'Color')!
    jest.clearAllMocks()
    act(() => colorRow.onPress!())
    expect(texts()).not.toContain('Garter')
    const swap = mockTouchableRipple.mock.calls.map((call) => call[0] as { accessibilityLabel?: string; onPress?: () => void }).find((props) => props.accessibilityLabel === 'Color 9, swap')!
    act(() => swap.onPress!())
    expect(onChange).toHaveBeenCalledWith('#000009')
  })

  it('is sized one row per option, plus the Color row or the color page', () => {
    expect(getOptionPickerContentSize(3)).toEqual({ width: 220, height: 16 + 3 * 36 })
    // The color page is taller than three rows and the Color row; the same page as a profile picker's.
    expect(getOptionPickerContentSize(3, {}).height).toBe(getProfilePickerContentSize(0, false, {}).height)
    expect(getOptionPickerContentSize(8, {}).height).toBe(16 + 8 * 36 + 36 + 9)
  })

  it('hands useAutoAlign its size and rotation, and lets alignOverride place it instead', () => {
    renderPicker({ rotation: 180, colorSection: { value: '#000003', onChange: jest.fn() } })
    const { width, height } = getOptionPickerContentSize(3, {})
    expect(mockUseAutoAlign).toHaveBeenCalledWith(false, width, height, 180)

    jest.clearAllMocks()
    renderPicker({ host: makeHost(ID), alignOverride: { align: 'left', verticalAlign: 'above', maxHeight: 120, measured: false, triggerRef: { current: null } } })
    // Unmeasured, so the dropdown stays hidden: only the trigger renders.
    expect(texts()).toEqual(['RATTLER'])
  })
})
