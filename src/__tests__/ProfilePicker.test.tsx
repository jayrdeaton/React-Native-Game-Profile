import { FadingScrollView, getContrastColor } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import type { PopoverHost } from '@tastic/hud/chrome'
import { PopoverBody, useAutoAlign } from '@tastic/hud/chrome'
import { act, render } from '@testing-library/react'
import { View } from 'react-native'
import { Icon, Text } from 'react-native-paper'

import { IdentityChip } from '../IdentityChip'
import { ProfileChip } from '../ProfileChip'
import { ProfileColorProvider, type ProfileSwatchRenderer } from '../ProfileColorContext'
import { getProfilePickerContentSize, ProfilePicker, ProfilePickerAlignResult, ProfilePickerColorSection } from '../ProfilePicker'
import { Profile } from '../types'

// These three cross-package peers are the real thing everywhere else in this fleet (never
// individually mocked - see the reference PalettePicker.test.tsx), but here they can't be: the
// real @rific/auto-paper import throws at module-load time against this package's own stubbed
// react-native-paper mock, and the real @rific/feedback-press build unconditionally
// require()s expo-haptics, which isn't installed as a dependency of this package. Standing in
// for all three keeps this file testing ProfilePicker's own wiring - what it selects, what it
// labels, what it sizes - rather than those packages' internals (already covered by their own
// suites). useAutoAlign in particular has to be faked outright, not just simplified: its real
// measurement path needs a live View ref, which the shared View mock (a plain function
// component, not forwardRef) never populates, so `measured` would never flip true and the whole
// dropdown would stay unrenderable under test.
jest.mock('@rific/auto-paper', () => ({
  getContrastColor: jest.fn((color: string) => `contrast(${color})`),
  // 20 colors, like the real palette, so the color section's grid is the real 5 x 4.
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

// Mocked the same way IconButton.test.tsx mocks Dialog: ProfileChip has its own dedicated test
// file, so this suite only needs to assert ProfilePicker passes it the right profile/filled
// props, not re-verify ProfileChip's own rendering.
jest.mock('../ProfileChip', () => ({
  ProfileChip: jest.fn(() => null)
}))

// Same for the chip trigger's IdentityChip: only the props ProfilePicker hands it matter here.
jest.mock('../IdentityChip', () => ({
  IdentityChip: jest.fn(() => null)
}))

const mockGetContrastColor = getContrastColor as unknown as jest.Mock
const mockTouchableRipple = TouchableRipple as unknown as jest.Mock
const mockPopoverBody = PopoverBody as unknown as jest.Mock
const mockUseAutoAlign = useAutoAlign as unknown as jest.Mock
const mockProfileChip = ProfileChip as unknown as jest.Mock
const mockIdentityChip = IdentityChip as unknown as jest.Mock
const mockIcon = Icon as unknown as jest.Mock
const mockText = Text as unknown as jest.Mock
const mockView = View as unknown as jest.Mock

const ZOE: Profile = { id: 'zoe', name: 'Zoe', color: '#ff0000', tag: 'Z', createdAt: 3, updatedAt: 3 }
const AMY: Profile = { id: 'amy', name: 'Amy', color: '#00ff00', tag: 'A', createdAt: 1, updatedAt: 1 }
const MIKE: Profile = { id: 'mike', name: 'Mike', color: '#0000ff', tag: '', createdAt: 2, updatedAt: 2 }
// Deliberately not already alphabetical - sortedProfiles is real behavior worth exercising.
const PROFILES: Profile[] = [ZOE, AMY, MIKE]

const ID_PREFIX = 'seat1'
const TRIGGER_ID = `${ID_PREFIX}-profile`

interface MockHost extends PopoverHost {
  toggle: jest.Mock
  close: jest.Mock
}

const makeHost = (openId: string | null): MockHost => ({
  openId,
  toggle: jest.fn(),
  close: jest.fn()
})

interface Overrides {
  host?: MockHost
  preview?: (hex: string) => string
  renderSwatch?: ProfileSwatchRenderer
  profiles?: Profile[]
  selectedId?: string | null
  takenId?: string | null
  takenIds?: string[]
  color?: string
  dark?: boolean
  align?: 'left' | 'right' | 'center'
  alignOverride?: ProfilePickerAlignResult
  rotation?: 0 | 90 | -90 | 180
  guestLabel?: string
  nullLabel?: string
  nullIcon?: string
  onSelect?: (profile: Profile | null) => void
  onManage?: () => void
  colorSection?: ProfilePickerColorSection
  triggerStyle?: object
}

function renderPicker(overrides: Overrides = {}) {
  const host = overrides.host ?? makeHost(null)
  const onSelect = overrides.onSelect ?? jest.fn()
  const utils = render(
    <ProfilePicker idPrefix={ID_PREFIX} host={host} profiles={overrides.profiles ?? PROFILES} selectedId={overrides.selectedId ?? null} takenId={overrides.takenId} takenIds={overrides.takenIds} color={overrides.color ?? '#123456'} dark={overrides.dark ?? false} align={overrides.align} alignOverride={overrides.alignOverride} rotation={overrides.rotation} guestLabel={overrides.guestLabel ?? 'guest'} nullLabel={overrides.nullLabel} nullIcon={overrides.nullIcon} onSelect={onSelect} onManage={overrides.onManage} colorSection={overrides.colorSection} triggerStyle={overrides.triggerStyle} />,
    overrides.preview || overrides.renderSwatch
      ? {
          wrapper: ({ children }) => (
            <ProfileColorProvider preview={overrides.preview} renderSwatch={overrides.renderSwatch}>
              {children}
            </ProfileColorProvider>
          )
        }
      : undefined
  )
  return { ...utils, host, onSelect }
}

const textChildrenOf = (call: unknown) => (call as [{ children?: unknown }])[0].children
const findText = (children: unknown) => mockText.mock.calls.find((call) => textChildrenOf(call) === children)?.[0] as { style?: unknown[] } | undefined
const findIcon = (source: string) => mockIcon.mock.calls.find((call) => (call[0] as { source?: string }).source === source)?.[0] as { color?: string } | undefined
const pressOf = (call: unknown) => (call as [{ onPress?: () => void }])[0].onPress
const styleOf = (call: unknown) => (call as [{ style?: unknown[] }])[0].style
// The one View ProfilePicker attaches the trigger ref to - the only `collapsable={false}` View it
// renders. (React 19 hands `ref` to a function component as an ordinary prop, so the shared View
// mock sees it in its props.)
// The menu's box - the one View sized to the popover's width.
const menuStyle = () => mockView.mock.calls.map((call) => (call[0] as { style?: unknown }).style).find((style) => Array.isArray(style) && style.some((part) => (part as { width?: number })?.width === 220))
const triggerViewProps = () => mockView.mock.calls.map((call) => call[0] as { collapsable?: boolean; ref?: unknown }).find((props) => props.collapsable === false) as { collapsable?: boolean; ref?: unknown }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('ProfilePicker', () => {
  describe('trigger', () => {
    it('shows the uppercased guest label when nothing is selected', () => {
      renderPicker({ guestLabel: 'guest' })
      expect(textChildrenOf(mockText.mock.calls[0])).toBe('GUEST')
    })

    it("shows the selected profile's uppercased name instead of the guest label", () => {
      renderPicker({ selectedId: AMY.id })
      expect(textChildrenOf(mockText.mock.calls[0])).toBe('AMY')
    })

    it('falls back to the guest label when selectedId matches no profile', () => {
      renderPicker({ selectedId: 'not-a-real-id' })
      expect(textChildrenOf(mockText.mock.calls[0])).toBe('GUEST')
    })

    it("colors its label and menu-down icon with the caller's own color", () => {
      renderPicker({ color: '#abcdef' })
      expect(styleOf(mockText.mock.calls[0])).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#abcdef' })]))
      expect(findIcon('menu-down')?.color).toBe('#abcdef')
    })

    it("toggles the popover host with this instance's own id when pressed", () => {
      const { host } = renderPicker()
      pressOf(mockTouchableRipple.mock.calls[0])?.()
      expect(host.toggle).toHaveBeenCalledWith(TRIGGER_ID)
    })
  })

  describe('closed popover', () => {
    it('renders only the trigger - no rows, no menu chrome', () => {
      renderPicker({ host: makeHost(null) })
      expect(mockTouchableRipple.mock.calls).toHaveLength(1)
      expect(mockPopoverBody.mock.calls[0][0]).toMatchObject({ visible: false })
    })
  })

  describe('open popover - null/guest row', () => {
    it('selects guest (null) and closes the popover on press', () => {
      const { host, onSelect } = renderPicker({ host: makeHost(TRIGGER_ID), selectedId: AMY.id })
      pressOf(mockTouchableRipple.mock.calls[1])?.()
      expect(onSelect).toHaveBeenCalledWith(null)
      expect(host.close).toHaveBeenCalledTimes(1)
    })

    it('defaults to a "Player" label and account-off-outline icon', () => {
      renderPicker({ host: makeHost(TRIGGER_ID) })
      expect(findText('Player')).toBeDefined()
      expect(findIcon('account-off-outline')).toBeDefined()
    })

    it('honors nullLabel/nullIcon overrides', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), nullLabel: 'All', nullIcon: 'account-group' })
      expect(findText('All')).toBeDefined()
      expect(findIcon('account-group')).toBeDefined()
    })

    it('fills with the seat color and contrast-safe icon when nothing is selected', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), color: '#123456', selectedId: null })
      expect(styleOf(mockTouchableRipple.mock.calls[1])).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: '#123456' })]))
      expect(findIcon('account-off-outline')?.color).toBe('contrast(#123456)')
    })

    it('is not highlighted, and uses the plain fg icon color, once a profile is selected instead', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), color: '#123456', selectedId: AMY.id, dark: false })
      expect(styleOf(mockTouchableRipple.mock.calls[1])).not.toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: '#123456' })]))
      expect(findIcon('account-off-outline')?.color).toBe('#000000')
    })
  })

  describe('open popover - profile rows', () => {
    it('renders one ProfileChip + label per profile, sorted alphabetically regardless of input order', () => {
      renderPicker({ host: makeHost(TRIGGER_ID) })
      const order = mockProfileChip.mock.calls.map((call) => (call[0] as { profile: Profile }).profile.name)
      expect(order).toEqual(['Amy', 'Mike', 'Zoe'])
    })

    it('does not mutate the profiles array it was given', () => {
      const before = [...PROFILES]
      renderPicker({ host: makeHost(TRIGGER_ID), profiles: PROFILES })
      expect(PROFILES).toEqual(before)
    })

    it('hands back the exact profile object it was given on selection, and closes the popover', () => {
      const { host, onSelect } = renderPicker({ host: makeHost(TRIGGER_ID) })
      // calls: [0] trigger, [1] null row, [2] Amy, [3] Mike, [4] Zoe (sorted)
      pressOf(mockTouchableRipple.mock.calls[2])?.()
      expect(onSelect).toHaveBeenCalledWith(AMY)
      expect(host.close).toHaveBeenCalledTimes(1)
    })

    it('highlights the selected row with its own color, passes filled=false to its chip, and unfilled=true to the rest', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), selectedId: MIKE.id })
      const chips = mockProfileChip.mock.calls.map((call) => call[0] as { profile: Profile; filled?: boolean })
      expect(chips).toEqual([expect.objectContaining({ profile: AMY, filled: true }), expect.objectContaining({ profile: MIKE, filled: false }), expect.objectContaining({ profile: ZOE, filled: true })])
      // Mike is sorted row index 1, i.e. TouchableRipple call index 3 (trigger + null row + Amy).
      expect(styleOf(mockTouchableRipple.mock.calls[3])).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: MIKE.color })]))
    })

    it("fills a selected row with ProfileColorProvider's preview of its color", () => {
      renderPicker({ host: makeHost(TRIGGER_ID), selectedId: MIKE.id, preview: (hex) => `muted(${hex})` })
      expect(styleOf(mockTouchableRipple.mock.calls[3])).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: `muted(${MIKE.color})` })]))
      expect(findText('Mike')?.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: `contrast(muted(${MIKE.color}))` })]))
    })

    it("colors a selected row's label for contrast against its own color", () => {
      renderPicker({ host: makeHost(TRIGGER_ID), selectedId: MIKE.id })
      expect(findText('Mike')?.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: `contrast(${MIKE.color})` })]))
      expect(mockGetContrastColor).toHaveBeenCalledWith(MIKE.color)
    })

    it("colors an unselected row's label with the plain fg color (dark-mode aware)", () => {
      renderPicker({ host: makeHost(TRIGGER_ID), selectedId: MIKE.id, dark: true })
      const amyText = findText('Amy')
      expect(amyText?.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#FFFFFF' })]))
    })

    it('disables the taken row and blocks selecting it, without touching the other rows', () => {
      const { host, onSelect } = renderPicker({ host: makeHost(TRIGGER_ID), takenId: MIKE.id })
      const disabledCalls = mockTouchableRipple.mock.calls.filter((call) => (call[0] as { disabled?: boolean }).disabled === true)
      expect(disabledCalls).toHaveLength(1)

      pressOf(disabledCalls[0])?.()
      expect(onSelect).not.toHaveBeenCalled()
      expect(host.close).not.toHaveBeenCalled()

      // The untaken rows still work.
      pressOf(mockTouchableRipple.mock.calls[2])?.() // Amy
      expect(onSelect).toHaveBeenCalledWith(AMY)
    })

    // The profile rows' pressables, by name (they're sorted: Amy, Mike, Zoe, after the trigger and the null row).
    const profileRowCalls = () => mockTouchableRipple.mock.calls.slice(2, 5)

    it('disables every takenIds row and blocks selecting them, for a lobby with more seats', () => {
      const { host, onSelect } = renderPicker({ host: makeHost(TRIGGER_ID), takenIds: [MIKE.id, ZOE.id] })
      expect(profileRowCalls().map((call) => (call[0] as { disabled?: boolean }).disabled)).toEqual([false, true, true])

      pressOf(profileRowCalls()[1])?.() // Mike
      pressOf(profileRowCalls()[2])?.() // Zoe
      expect(onSelect).not.toHaveBeenCalled()
      expect(host.close).not.toHaveBeenCalled()

      pressOf(profileRowCalls()[0])?.() // Amy
      expect(onSelect).toHaveBeenCalledWith(AMY)
    })

    it('disables the union when takenId and takenIds are both given', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), takenId: AMY.id, takenIds: [ZOE.id] })
      expect(profileRowCalls().map((call) => (call[0] as { disabled?: boolean }).disabled)).toEqual([true, false, true])
    })

    it("never counts this picker's own selection as taken through takenIds, so a host can pass every seated id", () => {
      const { onSelect } = renderPicker({ host: makeHost(TRIGGER_ID), selectedId: MIKE.id, takenIds: [AMY.id, MIKE.id] })
      expect(profileRowCalls().map((call) => (call[0] as { disabled?: boolean }).disabled)).toEqual([true, false, false])
      pressOf(profileRowCalls()[1])?.() // Mike, already selected here
      expect(onSelect).toHaveBeenCalledWith(MIKE)
    })

    it('disables nothing for an empty takenIds', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), takenIds: [] })
      expect(mockTouchableRipple.mock.calls.filter((call) => (call[0] as { disabled?: boolean }).disabled === true)).toHaveLength(0)
    })

    it('renders nothing but the null row when there are no saved profiles', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), profiles: [] })
      expect(mockProfileChip.mock.calls).toHaveLength(0)
      expect(mockTouchableRipple.mock.calls).toHaveLength(2) // trigger + null row only
    })
  })

  describe('manage row', () => {
    it('is omitted entirely when onManage is not passed', () => {
      renderPicker({ host: makeHost(TRIGGER_ID) })
      expect(findText('Manage')).toBeUndefined()
      expect(mockTouchableRipple.mock.calls).toHaveLength(5) // trigger + null + 3 profiles, no manage
    })

    it('is pinned below the scrolling rows, not one of them', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), onManage: jest.fn() })
      // Any element tree that renders the Manage label.
      const rendersManage = (node: unknown): boolean => {
        if (Array.isArray(node)) return node.some(rendersManage)
        if (!node || typeof node !== 'object' || !('props' in node)) return false
        const { type, props } = node as { type: unknown; props: { children?: unknown } }
        return (type === Text && props.children === 'Manage') || rendersManage(props.children)
      }
      const scroller = (FadingScrollView as unknown as jest.Mock).mock.calls[0][0] as { children?: unknown }
      expect(rendersManage(scroller.children)).toBe(false)
      expect(findText('Manage')).toBeDefined()
    })

    it('draws its label in the plain fg and its icon in the accent', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), onManage: jest.fn(), color: '#123456', dark: true })
      expect(styleOf(mockText.mock.calls.find((call) => textChildrenOf(call) === 'Manage'))).toEqual(expect.arrayContaining([{ color: '#FFFFFF' }]))
      expect(findIcon('account-cog-outline')?.color).toBe('#123456')
    })

    it('closes the popover, then calls onManage, in that order', () => {
      const onManage = jest.fn()
      const { host } = renderPicker({ host: makeHost(TRIGGER_ID), onManage })
      expect(mockTouchableRipple.mock.calls).toHaveLength(6)

      const order: string[] = []
      host.close.mockImplementation(() => order.push('close'))
      onManage.mockImplementation(() => order.push('manage'))

      pressOf(mockTouchableRipple.mock.calls[5])?.()
      expect(order).toEqual(['close', 'manage'])
    })
  })

  describe('popover sizing and alignment', () => {
    it('sizes the popover content for the null row plus every profile row', () => {
      renderPicker({ host: makeHost(null) })
      const [, contentWidth, contentHeight] = mockUseAutoAlign.mock.calls[0]
      expect(contentWidth).toBe(220)
      expect(contentHeight).toBe(8 * 2 + (PROFILES.length + 1) * 36) // 160
    })

    it('accounts for the extra manage row when onManage is passed', () => {
      renderPicker({ host: makeHost(null), onManage: jest.fn() })
      const [, , contentHeight] = mockUseAutoAlign.mock.calls[0]
      expect(contentHeight).toBe(8 * 2 + (PROFILES.length + 2) * 36) // 196
    })

    it('shrinks to just the null row when there are no profiles', () => {
      renderPicker({ host: makeHost(null), profiles: [] })
      const [, , contentHeight] = mockUseAutoAlign.mock.calls[0]
      expect(contentHeight).toBe(8 * 2 + 1 * 36) // 52
    })

    it('passes the open flag through to useAutoAlign', () => {
      renderPicker({ host: makeHost(TRIGGER_ID) })
      const [open] = mockUseAutoAlign.mock.calls[0]
      expect(open).toBe(true)
    })

    it('lets an explicit align prop override the hook-computed alignment', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), align: 'left' })
      expect(mockPopoverBody.mock.calls[0][0]).toMatchObject({ align: 'left' })
    })

    it('otherwise uses whatever useAutoAlign computed', () => {
      renderPicker({ host: makeHost(TRIGGER_ID) })
      expect(mockPopoverBody.mock.calls[0][0]).toMatchObject({ align: 'center', verticalAlign: 'below' })
    })

    it('sizes and colors the menu box from props and the measured maxHeight', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), color: '#123456', dark: true })
      expect(menuStyle()).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: '#000000', borderColor: '#123456', width: 220, maxHeight: 400 })]))
    })
  })

  describe('default placement (no alignOverride/rotation)', () => {
    it('calls useAutoAlign with exactly (open, popover width, content height, rotation 0) - unchanged from before these props existed', () => {
      renderPicker({ host: makeHost(null) })
      expect(mockUseAutoAlign).toHaveBeenCalledTimes(1)
      expect(mockUseAutoAlign).toHaveBeenCalledWith(false, 220, 160, 0)
    })

    it("passes open=true once its own trigger id is the host's open one", () => {
      renderPicker({ host: makeHost(TRIGGER_ID) })
      expect(mockUseAutoAlign).toHaveBeenCalledWith(true, 220, 160, 0)
    })

    it("attaches the hook's own triggerRef to the measured trigger view", () => {
      renderPicker({ host: makeHost(TRIGGER_ID) })
      const autoRef = (mockUseAutoAlign.mock.results[0].value as ProfilePickerAlignResult).triggerRef
      expect(triggerViewProps().ref).toBe(autoRef)
    })

    it('forwards an explicit rotation to useAutoAlign', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), rotation: 90 })
      expect(mockUseAutoAlign).toHaveBeenCalledWith(true, 220, 160, 90)
      jest.clearAllMocks()
      renderPicker({ host: makeHost(TRIGGER_ID), rotation: -90 })
      expect(mockUseAutoAlign).toHaveBeenCalledWith(true, 220, 160, -90)
    })
  })

  describe('alignOverride', () => {
    const overrideRef = { current: null }
    const override: ProfilePickerAlignResult = { align: 'left', verticalAlign: 'above', maxHeight: 123, measured: true, triggerRef: overrideRef }

    it("drives the popover's alignment, vertical side and visibility from the override instead of the hook's result", () => {
      renderPicker({ host: makeHost(TRIGGER_ID), alignOverride: override })
      // useAutoAlign's own (mocked) result is center/below/measured - none of it may leak through.
      expect(mockPopoverBody.mock.calls[0][0]).toMatchObject({ visible: true, align: 'left', verticalAlign: 'above' })
    })

    it("sizes the menu box's maxHeight from the override", () => {
      renderPicker({ host: makeHost(TRIGGER_ID), alignOverride: override })
      expect(menuStyle()).toEqual(expect.arrayContaining([expect.objectContaining({ maxHeight: 123 })]))
    })

    it("gates visibility on the override's own `measured`, not the hook's", () => {
      // The hook (mocked) says measured=true; the override says its measurement hasn't landed yet.
      renderPicker({ host: makeHost(TRIGGER_ID), alignOverride: { ...override, measured: false } })
      expect(mockPopoverBody.mock.calls[0][0]).toMatchObject({ visible: false })
    })

    it('shows the popover once the override is measured even when the hook itself never measured', () => {
      mockUseAutoAlign.mockReturnValueOnce({ align: 'center', maxHeight: 400, measured: false, triggerRef: { current: null }, verticalAlign: 'below' })
      renderPicker({ host: makeHost(TRIGGER_ID), alignOverride: override })
      expect(mockPopoverBody.mock.calls[0][0]).toMatchObject({ visible: true })
    })

    it("attaches the override's triggerRef (not the hook's) to the measured trigger view", () => {
      renderPicker({ host: makeHost(TRIGGER_ID), alignOverride: override })
      const autoRef = (mockUseAutoAlign.mock.results[0].value as ProfilePickerAlignResult).triggerRef
      expect(triggerViewProps().ref).toBe(overrideRef)
      expect(triggerViewProps().ref).not.toBe(autoRef)
    })

    it('still calls useAutoAlign (hooks cannot be conditional), sized identically', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), alignOverride: override })
      expect(mockUseAutoAlign).toHaveBeenCalledWith(true, 220, 160, 0)
    })

    it("has the same shape as what @tastic/hud's own useAutoAlign returns (compile-time guard, both directions)", () => {
      const asOverride = (result: ReturnType<typeof useAutoAlign>): ProfilePickerAlignResult => result
      const asHookResult = (result: ProfilePickerAlignResult): ReturnType<typeof useAutoAlign> => result
      expect(asHookResult(asOverride(override))).toBe(override)
    })

    it("lets a forced `align` still beat the override's own align", () => {
      renderPicker({ host: makeHost(TRIGGER_ID), alignOverride: override, align: 'right' })
      expect(mockPopoverBody.mock.calls[0][0]).toMatchObject({ align: 'right', verticalAlign: 'above' })
    })
  })

  describe('getProfilePickerContentSize', () => {
    it.each([
      [0, 52],
      [1, 88],
      [2, 124],
      [5, 232]
    ])('is 220 wide and %i profile(s) tall = 8*2 + (n + 1) * 36 = %i without a manage row', (profileCount, height) => {
      expect(getProfilePickerContentSize(profileCount)).toEqual({ width: 220, height })
    })

    it.each([
      [0, 88],
      [1, 124],
      [2, 160],
      [5, 268]
    ])('adds exactly one 36pt row for the manage row: %i profile(s) -> %i', (profileCount, height) => {
      expect(getProfilePickerContentSize(profileCount, true)).toEqual({ width: 220, height })
    })

    it('is the exact size the component hands useAutoAlign, with and without a manage row', () => {
      for (const hasManage of [false, true]) {
        jest.clearAllMocks()
        renderPicker({ host: makeHost(null), onManage: hasManage ? jest.fn() : undefined })
        const { width, height } = getProfilePickerContentSize(PROFILES.length, hasManage)
        expect(mockUseAutoAlign).toHaveBeenCalledWith(false, width, height, 0)
      }
    })
  })
  describe('colorSection', () => {
    const SWATCH = (i: number) => `#0000${i.toString(16).padStart(2, '0')}`
    const section = (overrides: Partial<ProfilePickerColorSection> = {}): ProfilePickerColorSection => ({ value: SWATCH(3), onChange: jest.fn(), ...overrides })
    const swatchCalls = () => mockTouchableRipple.mock.calls.filter((call) => /^Color \d+(, (profile color|taken|swap))?$/.test((call[0] as { accessibilityLabel?: string }).accessibilityLabel ?? ''))

    it("leads the trigger with a chip in the live color and the selected profile's tag", () => {
      renderPicker({ colorSection: section(), selectedId: AMY.id, color: '#abcdef' })
      expect(mockIdentityChip).toHaveBeenCalledWith(expect.objectContaining({ color: '#abcdef', tag: 'A', size: 32 }), undefined)
      expect(textChildrenOf(mockText.mock.calls[0])).toBe('AMY')
    })

    it('shows the null icon on the chip when nothing is selected', () => {
      renderPicker({ colorSection: section(), nullIcon: 'incognito' })
      expect(mockIdentityChip).toHaveBeenCalledWith(expect.objectContaining({ tag: undefined, icon: 'incognito' }), undefined)
    })

    it("draws the chip trigger's name and chevron in the plain fg, leaving the color to the chip", () => {
      renderPicker({ colorSection: section(), selectedId: AMY.id, color: '#abcdef', dark: false })
      expect(styleOf(mockText.mock.calls[0])).toEqual(expect.arrayContaining([{ color: '#000000' }]))
      expect(findIcon('menu-down')?.color).toBe('#000000')
    })

    it('has no chip without a color section', () => {
      renderPicker({ selectedId: AMY.id })
      expect(mockIdentityChip).not.toHaveBeenCalled()
    })

    it("applies the host's triggerStyle to the pressable trigger", () => {
      renderPicker({ colorSection: section(), triggerStyle: { backgroundColor: '#eeeeee' } })
      expect(styleOf(mockTouchableRipple.mock.calls[0])).toEqual(expect.arrayContaining([{ backgroundColor: '#eeeeee' }]))
    })

    it('points the caret at the middle of the pill, from its measured width', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section() })
      const anchor = mockView.mock.calls.map((call) => call[0] as { onLayout?: (e: unknown) => void }).find((props) => props.onLayout)
      act(() => anchor!.onLayout!({ nativeEvent: { layout: { width: 180, height: 44 } } }))
      expect(mockPopoverBody.mock.calls[mockPopoverBody.mock.calls.length - 1][0]).toMatchObject({ triggerSize: 180 })
    })

    it("keeps the plain trigger's caret where it was", () => {
      renderPicker({ host: makeHost(TRIGGER_ID) })
      expect(mockPopoverBody.mock.calls[0][0]).toMatchObject({ triggerSize: 28 })
    })

    // The Color row on the list page (its label, or "label, caption"), and the color page's back row.
    const colorRow = () =>
      mockTouchableRipple.mock.calls
        .map((call) => call[0] as { accessibilityLabel?: string; onPress?: () => void; style?: unknown[] })
        .filter((props) => /^(Card )?Color(, .*)?$/.test(props.accessibilityLabel ?? ''))
        .pop()
    const backRow = () =>
      mockTouchableRipple.mock.calls
        .map((call) => call[0] as { accessibilityLabel?: string; onPress?: () => void })
        .filter((props) => props.accessibilityLabel === 'Back')
        .pop()
    // Opens the color page; the calls recorded from then on are its render.
    const openColorPage = () => {
      const row = colorRow()!
      jest.clearAllMocks()
      act(() => row.onPress!())
    }
    const dotCalls = () => mockView.mock.calls.filter((call) => Array.isArray((call[0] as { style?: unknown }).style) && ((call[0] as { style: unknown[] }).style[0] as { width?: number })?.width === 8)

    it('puts a Color row with its caption above every profile row, and no swatches on the list', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section({ label: 'Card Color', caption: 'Solitaire only' }) })
      const texts = mockText.mock.calls.map(textChildrenOf)
      expect(texts.indexOf('Card Color')).toBeGreaterThan(0)
      expect(texts.indexOf('Solitaire only')).toBe(texts.indexOf('Card Color') + 1)
      expect(texts.indexOf('Card Color')).toBeLessThan(texts.indexOf('Player'))
      expect(colorRow()?.accessibilityLabel).toBe('Card Color, Solitaire only')
      expect(findIcon('chevron-right')).toBeDefined()
      expect(swatchCalls()).toHaveLength(0)
    })

    it('draws the color in effect on the Color row, through previewValue', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section({ previewValue: (hex) => `muted(${hex})` }) })
      expect(mockView.mock.calls.some((call) => Array.isArray((call[0] as { style?: unknown }).style) && ((call[0] as { style: unknown[] }).style as object[]).some((part) => (part as { backgroundColor?: string })?.backgroundColor === `muted(${SWATCH(3)})`))).toBe(true)
    })

    it("defaults the label to 'Color', leaves the caption out, and keeps a plain row's height", () => {
      renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section() })
      const texts = mockText.mock.calls.map(textChildrenOf)
      expect(texts).toContain('Color')
      expect(texts).toHaveLength(new Set(texts).size)
      expect(colorRow()?.style).toEqual(expect.arrayContaining([{ height: 36 }]))
    })

    it('swaps the list for the color page: a back row and the swatches, no profile rows', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section(), onManage: jest.fn() })
      openColorPage()
      const texts = mockText.mock.calls.map(textChildrenOf)
      expect(texts).toContain('Color')
      expect(texts).not.toContain('Player')
      expect(texts).not.toContain('Amy')
      expect(texts).not.toContain('Manage')
      expect(backRow()).toBeDefined()
      expect(findIcon('chevron-left')).toBeDefined()
      expect(swatchCalls()).toHaveLength(20)
    })

    it('goes back to the list from the back row', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section() })
      openColorPage()
      const back = backRow()!
      jest.clearAllMocks()
      act(() => back.onPress!())
      expect(mockText.mock.calls.map(textChildrenOf)).toContain('Player')
      expect(swatchCalls()).toHaveLength(0)
    })

    it('starts on the list again whenever the trigger is pressed', () => {
      const { host } = renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section() })
      openColorPage()
      const trigger = mockTouchableRipple.mock.calls[0][0] as { onPress: () => void }
      jest.clearAllMocks()
      act(() => trigger.onPress())
      expect(host.toggle).toHaveBeenCalledWith(TRIGGER_ID)
      expect(mockText.mock.calls.map(textChildrenOf)).toContain('Player')
      expect(swatchCalls()).toHaveLength(0)
    })

    it('draws one swatch per color through previewValue and checks the one in effect, ignoring case', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section({ value: SWATCH(3).toUpperCase(), previewValue: (hex) => `muted(${hex})` }) })
      openColorPage()
      const swatches = swatchCalls().map((call) => call[0] as { style?: unknown[]; accessibilityState?: { selected?: boolean } })
      expect(swatches).toHaveLength(20)
      expect(swatches[0].style).toEqual(expect.arrayContaining([{ backgroundColor: `muted(${SWATCH(0)})` }]))
      expect(swatches.map((props) => props.accessibilityState?.selected)).toEqual(Array.from({ length: 20 }, (_, i) => i === 3))
      expect(findIcon('check')?.color).toBe(`contrast(muted(${SWATCH(3)}))`)
    })

    it("dots the selected profile's own swatch while another color is in effect", () => {
      const own = { ...AMY, color: SWATCH(5).toUpperCase() }
      renderPicker({ host: makeHost(TRIGGER_ID), profiles: [own], selectedId: own.id, colorSection: section({ value: SWATCH(3) }) })
      openColorPage()
      const labels = swatchCalls().map((call) => (call[0] as { accessibilityLabel: string }).accessibilityLabel)
      expect(labels.filter((label) => label.endsWith(', profile color'))).toEqual(['Color 5, profile color'])
      expect(dotCalls()).toHaveLength(1)
      expect((dotCalls()[0][0] as { style: unknown[] }).style).toContainEqual({ backgroundColor: `contrast(${SWATCH(5)})` })
    })

    it("shows the check, not the dot, when the profile's own color is the one in effect", () => {
      const own = { ...AMY, color: SWATCH(3) }
      renderPicker({ host: makeHost(TRIGGER_ID), profiles: [own], selectedId: own.id, colorSection: section({ value: SWATCH(3) }) })
      openColorPage()
      expect(findIcon('check')).toBeDefined()
      expect(dotCalls()).toHaveLength(0)
    })

    it('dots nothing for the null selection', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section() })
      openColorPage()
      expect(
        swatchCalls()
          .map((call) => (call[0] as { accessibilityLabel: string }).accessibilityLabel)
          .filter((label) => label.endsWith(', profile color'))
      ).toEqual([])
    })

    it("fades and disables another seat's color, marked with an X", () => {
      renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section({ takenValue: SWATCH(9).toUpperCase() }) })
      openColorPage()
      const swatches = swatchCalls().map((call) => call[0] as { accessibilityLabel: string; disabled?: boolean; style?: unknown[] })
      expect(swatches.filter((props) => props.disabled).map((props) => props.accessibilityLabel)).toEqual(['Color 9, taken'])
      expect(swatches[9].style).toContainEqual(expect.objectContaining({ opacity: 0.35 }))
      expect(findIcon('close')?.color).toBe(`contrast(${SWATCH(9)})`)
      expect(findIcon('swap-horizontal')).toBeUndefined()
    })

    it('lets the taken color be picked with allowSwapTaken, marked with a swap icon', () => {
      const onChange = jest.fn()
      renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section({ onChange, takenValue: SWATCH(9), allowSwapTaken: true }) })
      openColorPage()
      const swatch = swatchCalls()[9]
      expect(swatch[0]).toMatchObject({ accessibilityLabel: 'Color 9, swap', disabled: false })
      expect(findIcon('swap-horizontal')).toBeDefined()
      expect(findIcon('close')).toBeUndefined()
      act(() => pressOf(swatch)!())
      expect(onChange).toHaveBeenCalledWith(SWATCH(9))
    })

    it('never marks the color in effect as taken', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section({ takenValue: SWATCH(3) }) })
      openColorPage()
      expect(swatchCalls().filter((call) => (call[0] as { disabled?: boolean }).disabled)).toHaveLength(0)
      expect(findIcon('check')).toBeDefined()
    })

    it('commits the raw color on a swatch press and leaves the popover open', () => {
      const onChange = jest.fn()
      const { host } = renderPicker({ host: makeHost(TRIGGER_ID), colorSection: section({ onChange, previewValue: (hex) => `muted(${hex})` }) })
      openColorPage()
      const swatch = swatchCalls()[7]
      jest.clearAllMocks()
      act(() => pressOf(swatch)!())
      expect(onChange).toHaveBeenCalledWith(SWATCH(7))
      expect(host.close).not.toHaveBeenCalled()
    })

    describe("with ProfileColorProvider's renderSwatch", () => {
      // Stands in for a host's drawing (Hangman's pie of the color's triad); its calls are what was drawn.
      const renderSwatch = jest.fn((_color: string, _size: number) => null)
      const drawnSwatches = () => renderSwatch.mock.calls.map(([color, size]) => ({ color, size }))
      // SwatchLayer's clip: the absolutely placed View the drawing sits in.
      const layerStyles = () => mockView.mock.calls.map((call) => (call[0] as { style?: unknown }).style).filter((style) => Array.isArray(style) && (style[0] as { position?: string })?.position === 'absolute' && (style[0] as { overflow?: string })?.overflow === 'hidden') as object[][]

      it("draws the Color row's swatch with it, through previewValue, in place of the flat fill", () => {
        renderPicker({ host: makeHost(TRIGGER_ID), renderSwatch, colorSection: section({ previewValue: (hex) => `muted(${hex})` }) })
        expect(drawnSwatches()).toEqual([{ color: `muted(${SWATCH(3)})`, size: 22 }])
        expect(mockView.mock.calls.some((call) => Array.isArray((call[0] as { style?: unknown }).style) && ((call[0] as { style: unknown[] }).style as object[]).some((part) => (part as { backgroundColor?: string })?.backgroundColor === `muted(${SWATCH(3)})`))).toBe(false)
        expect(layerStyles()).toEqual([expect.arrayContaining([{ borderRadius: 11, height: 22, width: 22 }])])
      })

      it("draws every color page swatch with it, inside the selected one's ring, with no flat fill", () => {
        renderPicker({ host: makeHost(TRIGGER_ID), renderSwatch, colorSection: section({ previewValue: (hex) => `muted(${hex})` }) })
        openColorPage()
        expect(drawnSwatches()).toEqual(Array.from({ length: 20 }, (_, i) => ({ color: `muted(${SWATCH(i)})`, size: i === 3 ? 24 : 28 })))
        const swatchStyles = swatchCalls().map((call) => (call[0] as { style: unknown[] }).style)
        expect(swatchStyles).toHaveLength(20)
        expect(swatchStyles.filter((style) => style.some((part) => !!part && typeof part === 'object' && 'backgroundColor' in part))).toEqual([])
      })

      it("takes the check's and the X's contrast from the swatch's own color, and keeps each swatch one child", () => {
        renderPicker({ host: makeHost(TRIGGER_ID), renderSwatch, colorSection: section({ takenValue: SWATCH(9) }) })
        openColorPage()
        expect(findIcon('check')?.color).toBe(`contrast(${SWATCH(3)})`)
        expect(findIcon('close')?.color).toBe(`contrast(${SWATCH(9)})`)
        // TouchableRipple takes one child: the drawn swatch and its mark share a face View.
        for (const call of swatchCalls()) {
          const child = (call[0] as { children?: unknown }).children
          expect(Array.isArray(child)).toBe(false)
          expect((child as { type?: unknown }).type).toBe(View)
        }
      })

      it('leaves the flat swatches alone without it', () => {
        renderPicker({ host: makeHost(TRIGGER_ID), preview: (hex) => hex, colorSection: section() })
        openColorPage()
        expect(renderSwatch).not.toHaveBeenCalled()
        expect(layerStyles()).toEqual([])
        expect((swatchCalls()[0][0] as { style?: unknown[] }).style).toEqual(expect.arrayContaining([{ backgroundColor: SWATCH(0) }]))
      })
    })

    it('is sized as the taller page: the list with the Color row and its divider, or the back row and 4 rows of swatches', () => {
      // List: 8 * 2 + (2 profiles + null + Manage) * 36 + Color row (48 with a caption, 36 without) + divider 9.
      expect(getProfilePickerContentSize(2, true, { caption: 'Solitaire only' }).height).toBe(16 + 4 * 36 + 48 + 9)
      expect(getProfilePickerContentSize(2, true, {}).height).toBe(16 + 4 * 36 + 36 + 9)
      // Color page: 8 * 2 + back row 36 + 4 + (4 * 28 + 3 * 9) + 8 = 203, taller than a short list.
      expect(getProfilePickerContentSize(0, false, { caption: 'Solitaire only' }).height).toBe(16 + 36 + 4 + 4 * 28 + 3 * 9 + 8)
    })

    it('hands useAutoAlign the size getProfilePickerContentSize gives for the same section', () => {
      const colorSection = section({ caption: 'Solitaire only' })
      renderPicker({ colorSection, onManage: jest.fn() })
      const { width, height } = getProfilePickerContentSize(PROFILES.length, true, colorSection)
      expect(mockUseAutoAlign).toHaveBeenCalledWith(false, width, height, 0)
    })
  })
})
