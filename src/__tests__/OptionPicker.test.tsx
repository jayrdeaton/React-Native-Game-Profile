import { TouchableRipple } from '@rific/feedback-press'
import type { PopoverHost } from '@tastic/hud/chrome'
import { useAutoAlign, useLettering } from '@tastic/hud/chrome'
import { act, render } from '@testing-library/react'
import { View } from 'react-native'
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
  useLettering: jest.fn(() => ({})),
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
const mockView = View as unknown as jest.Mock

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
  dark?: boolean
  triggerStyle?: object
  caption?: string
}

function renderPicker(overrides: Overrides = {}) {
  const host = overrides.host ?? makeHost(null)
  const onChange = overrides.onChange ?? jest.fn()
  render(<OptionPicker id={ID} host={host} options={OPTIONS} value={overrides.value ?? 'normal'} onChange={onChange} color='#123456' dark={overrides.dark ?? true} icon='robot' colorSection={overrides.colorSection} alignOverride={overrides.alignOverride} triggerStyle={overrides.triggerStyle} caption={overrides.caption} />)
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

  // A game's own lettering on the pill's label (hud's LetteringProvider: AlphaTastic's title font).
  it("letters its label in the game's lettering", () => {
    const lettering = { fontFamily: 'AlphaSketch' }
    jest.mocked(useLettering).mockReturnValue({ label: lettering })
    renderPicker({ value: 'hard' })
    const label = (Text as unknown as jest.Mock).mock.calls.find((call) => call[0].children === 'KING COBRA')![0]
    expect([label.style].flat(Infinity)).toContainEqual(lettering)
    jest.mocked(useLettering).mockReturnValue({})
  })

  // What the pill picks, over its value, so a pill reading "Any" says what it's for.
  it('captions its label, in the lettering at a smaller size, and is read caption first', () => {
    const lettering = { fontFamily: 'AlphaSketch', fontSize: 14 }
    jest.mocked(useLettering).mockReturnValue({ label: lettering })
    renderPicker({ value: 'hard', caption: 'Difficulty' })
    expect(texts()).toEqual(['DIFFICULTY', 'KING COBRA'])
    const caption = (Text as unknown as jest.Mock).mock.calls.find((call) => call[0].children === 'DIFFICULTY')![0]
    const style = [caption.style].flat(Infinity)
    expect(style).toContainEqual(lettering)
    // The caption's own size comes after the lettering's.
    expect(Object.assign({}, ...style)).toMatchObject({ fontFamily: 'AlphaSketch', fontSize: 10 })
    expect(mockTouchableRipple.mock.calls[0][0]).toMatchObject({ accessibilityLabel: 'DIFFICULTY, KING COBRA' })
    jest.mocked(useLettering).mockReturnValue({})
  })

  it('is read by its label alone without a caption', () => {
    renderPicker({ value: 'hard' })
    expect(mockTouchableRipple.mock.calls[0][0]).toMatchObject({ accessibilityLabel: 'KING COBRA' })
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

  // A difficulty's own color on its row's icon, until that row is the selected one (filled with the
  // picker's color, its icon contrasting like the label).
  it("draws an option's own color on its row icon until it's selected", () => {
    const colored: OptionPickerOption<Level>[] = [
      { value: 'easy', label: 'Garter', icon: 'emoticon-happy-outline', color: '#00AA00' },
      { value: 'normal', label: 'Rattler', color: '#AAAA00' },
      { value: 'hard', label: 'King Cobra', icon: 'fire' }
    ]
    render(<OptionPicker id={ID} host={makeHost(ID)} options={colored} value='normal' onChange={jest.fn()} color='#123456' dark icon='robot' />)
    const rowIconColors = mockIcon.mock.calls
      .map((call) => call[0] as { source: string; color: string })
      .filter((props) => props.source !== 'menu-down')
      .map((props) => props.color)
    expect(rowIconColors).toEqual(['#00AA00', 'contrast(#123456)', '#FFFFFF'])
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

  // DuelTastic's opponent menu: a CPU's levels, then Solo, then Player, each group set apart.
  it('draws a divider above an option that asks for one, never above the first, and is sized for them', () => {
    const grouped: OptionPickerOption<string>[] = [
      { value: 'easy', label: 'Garter', dividerBefore: true },
      { value: 'normal', label: 'Rattler' },
      { value: 'solo', label: 'Solo', dividerBefore: true },
      { value: 'person', label: 'Player', dividerBefore: true }
    ]
    render(<OptionPicker id={ID} host={makeHost(ID)} options={grouped} value='normal' onChange={jest.fn()} color='#123456' dark icon='robot' />)
    const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
    const dividers = mockView.mock.calls.map((call) => flat((call[0] as { style?: unknown }).style)).filter((style) => style.height === 1)
    expect(dividers).toEqual([expect.objectContaining({ backgroundColor: '#123456' }), expect.objectContaining({ backgroundColor: '#123456' })])
    expect(texts()).toEqual(['RATTLER', 'Garter', 'Rattler', 'Solo', 'Player'])

    expect(getOptionPickerContentSize(grouped)).toEqual({ width: 220, height: 16 + 4 * 36 + 2 * 9 })
    // With a Color row the dividers make the list page taller than the color page.
    expect(getOptionPickerContentSize(grouped, {}).height).toBe(16 + 4 * 36 + 2 * 9 + 36 + 9)
    expect(getOptionPickerContentSize(OPTIONS)).toEqual(getOptionPickerContentSize(3))
  })

  it('is sized one row per option, plus the Color row or the color page', () => {
    expect(getOptionPickerContentSize(3)).toEqual({ width: 220, height: 16 + 3 * 36 })
    // The color page is taller than three rows and the Color row; the same page as a profile picker's.
    expect(getOptionPickerContentSize(3, {}).height).toBe(getProfilePickerContentSize(0, false, {}).height)
    expect(getOptionPickerContentSize(8, {}).height).toBe(16 + 8 * 36 + 36 + 9)
  })

  // Solitaire's Stats screen: two of these side by side, each given a flexShrink (ProfilePicker.test.tsx
  // covers the shrinking in full).
  it('shrinks in its row like the chip pill it is, with a flexShrink in triggerStyle', () => {
    const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
    renderPicker({ triggerStyle: [{ backgroundColor: '#222222' }, { flexShrink: 1 }] })
    const anchor = mockView.mock.calls.map((call) => flat((call[0] as { style?: unknown }).style)).find((style) => style.position === 'relative')
    expect(anchor).toMatchObject({ flexShrink: 1, minWidth: 84 })
    expect(flat((mockTouchableRipple.mock.calls[0][0] as { style?: unknown }).style)).toMatchObject({ backgroundColor: '#222222', maxWidth: '100%' })
  })

  it('hands useAutoAlign its size, and lets alignOverride place it instead', () => {
    renderPicker({ colorSection: { value: '#000003', onChange: jest.fn() } })
    const { width, height } = getOptionPickerContentSize(3, {})
    expect(mockUseAutoAlign).toHaveBeenCalledWith(false, width, height)

    jest.clearAllMocks()
    renderPicker({ host: makeHost(ID), alignOverride: { align: 'left', verticalAlign: 'above', maxHeight: 120, measured: false, triggerRef: { current: null } } })
    // Unmeasured, so the dropdown stays hidden: only the trigger renders.
    expect(texts()).toEqual(['RATTLER'])
  })

  // A stats screen's games, Solitaire and Two Player (Jay, 2026-11-20: a shorter list): a group is a row with a chevron opening a page of
  // its own options behind a back row, as the Color row does.
  describe('groups', () => {
    type Game = 'all' | 'solo' | 'solo-all' | 'klondike' | 'spider' | 'duo' | 'duo-all' | 'war'
    const GAMES: OptionPickerOption<Game>[] = [
      { value: 'all', label: 'All Games', icon: 'view-grid-outline' },
      {
        value: 'solo',
        label: 'Solitaire',
        options: [
          { value: 'solo-all', label: 'All', triggerLabel: 'Solitaire' },
          { value: 'klondike', label: 'Klondike' },
          { value: 'spider', label: 'Spider' }
        ]
      },
      {
        value: 'duo',
        label: 'Two Player',
        options: [
          { value: 'duo-all', label: 'All', triggerLabel: 'Two Player' },
          { value: 'war', label: 'War' }
        ]
      }
    ]
    const renderGames = (host: ReturnType<typeof makeHost>, value: Game, onChange = jest.fn()) => {
      const view = render(<OptionPicker id={ID} host={host} options={GAMES} value={value} onChange={onChange} color='#123456' dark icon='view-grid-outline' />)
      return { ...view, onChange }
    }
    // The last row drawn with this label: its element tree, walked through props.children
    const holds = (node: unknown, label: string): boolean => {
      if (typeof node === 'string') return node === label
      if (Array.isArray(node)) return node.some((child) => holds(child, label))
      return !!node && typeof node === 'object' && 'props' in node && holds((node as { props: { children?: unknown } }).props.children, label)
    }
    const ripple = (label: string) => mockTouchableRipple.mock.calls.map((call) => call[0]).findLast((props: { children?: unknown }) => holds(props.children, label)) as { onPress: () => void; style?: unknown[] }

    it('names a pick in a group on the pill, by its own label or the one it asks for', () => {
      renderGames(makeHost(null), 'spider')
      expect(texts()).toEqual(['SPIDER'])
      jest.clearAllMocks()
      renderGames(makeHost(null), 'duo-all')
      expect(texts()).toEqual(['TWO PLAYER'])
    })

    it('lists the groups as rows on the top list, the one holding the pick filled', () => {
      renderGames(makeHost(ID), 'klondike')
      expect(texts()).toEqual(['KLONDIKE', 'All Games', 'Solitaire', 'Two Player'])
      expect(ripple('Solitaire').style).toContainEqual({ backgroundColor: '#123456' })
      expect(ripple('Two Player').style).not.toContainEqual({ backgroundColor: '#123456' })
    })

    it("opens a group's page behind a back row, picks from it, and opens on the top list again", () => {
      const host = makeHost(ID)
      const { onChange, rerender } = renderGames(host, 'all')
      act(() => ripple('Two Player').onPress())
      expect(texts().slice(-3)).toEqual(['Two Player', 'All', 'War'])
      act(() => ripple('War').onPress())
      expect(onChange).toHaveBeenCalledWith('war')
      expect(host.close).toHaveBeenCalled()
      // Closed, then opened again: the top list
      rerender(<OptionPicker id={ID} host={makeHost(null)} options={GAMES} value='war' onChange={onChange} color='#123456' dark icon='view-grid-outline' />)
      jest.clearAllMocks()
      rerender(<OptionPicker id={ID} host={makeHost(ID)} options={GAMES} value='war' onChange={onChange} color='#123456' dark icon='view-grid-outline' />)
      expect(texts()).toEqual(['WAR', 'All Games', 'Solitaire', 'Two Player'])
    })

    it("goes back to the top list from a group's back row", () => {
      renderGames(makeHost(ID), 'all')
      act(() => ripple('Solitaire').onPress())
      act(() => ripple('Solitaire').onPress())
      expect(texts().slice(-3)).toEqual(['All Games', 'Solitaire', 'Two Player'])
    })

    it("is sized for the tallest page: the top list, or a group's back row and options", () => {
      const tall: OptionPickerOption<string>[] = [
        { value: 'a', label: 'A' },
        { value: 'g', label: 'G', options: Array.from({ length: 6 }, (_, i) => ({ value: `g${i}`, label: `G${i}` })) }
      ]
      expect(getOptionPickerContentSize(tall)).toEqual(getOptionPickerContentSize(7))
      expect(getOptionPickerContentSize(GAMES)).toEqual(getOptionPickerContentSize(4))
    })
  })
})
