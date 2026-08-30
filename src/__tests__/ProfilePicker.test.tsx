import { getContrastColor } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import type { PopoverHost } from '@tastic/hud'
import { PopoverBody, useAutoAlign } from '@tastic/hud'
import { render } from '@testing-library/react'
import { ScrollView } from 'react-native'
import { Icon, Text } from 'react-native-paper'

import { ProfileChip } from '../ProfileChip'
import { ProfilePicker } from '../ProfilePicker'
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
  getContrastColor: jest.fn((color: string) => `contrast(${color})`)
}))

jest.mock('@rific/feedback-press', () => ({
  TouchableRipple: jest.fn((props: { children?: unknown }) => props.children ?? null)
}))

jest.mock('@tastic/hud', () => ({
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

const mockGetContrastColor = getContrastColor as unknown as jest.Mock
const mockTouchableRipple = TouchableRipple as unknown as jest.Mock
const mockPopoverBody = PopoverBody as unknown as jest.Mock
const mockUseAutoAlign = useAutoAlign as unknown as jest.Mock
const mockProfileChip = ProfileChip as unknown as jest.Mock
const mockIcon = Icon as unknown as jest.Mock
const mockText = Text as unknown as jest.Mock
const mockScrollView = ScrollView as unknown as jest.Mock

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
  profiles?: Profile[]
  selectedId?: string | null
  takenId?: string | null
  color?: string
  dark?: boolean
  align?: 'left' | 'right' | 'center'
  guestLabel?: string
  nullLabel?: string
  nullIcon?: string
  onSelect?: (profile: Profile | null) => void
  onManage?: () => void
}

function renderPicker(overrides: Overrides = {}) {
  const host = overrides.host ?? makeHost(null)
  const onSelect = overrides.onSelect ?? jest.fn()
  const utils = render(<ProfilePicker idPrefix={ID_PREFIX} host={host} profiles={overrides.profiles ?? PROFILES} selectedId={overrides.selectedId ?? null} takenId={overrides.takenId} color={overrides.color ?? '#123456'} dark={overrides.dark ?? false} align={overrides.align} guestLabel={overrides.guestLabel ?? 'guest'} nullLabel={overrides.nullLabel} nullIcon={overrides.nullIcon} onSelect={onSelect} onManage={overrides.onManage} />)
  return { ...utils, host, onSelect }
}

const textChildrenOf = (call: unknown) => (call as [{ children?: unknown }])[0].children
const findText = (children: unknown) => mockText.mock.calls.find((call) => textChildrenOf(call) === children)?.[0] as { style?: unknown[] } | undefined
const findIcon = (source: string) => mockIcon.mock.calls.find((call) => (call[0] as { source?: string }).source === source)?.[0] as { color?: string } | undefined
const pressOf = (call: unknown) => (call as [{ onPress?: () => void }])[0].onPress
const styleOf = (call: unknown) => (call as [{ style?: unknown[] }])[0].style

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

    it('sizes and colors the menu ScrollView from props and the measured maxHeight', () => {
      renderPicker({ host: makeHost(TRIGGER_ID), color: '#123456', dark: true })
      const style = styleOf(mockScrollView.mock.calls[0])
      expect(style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: '#000000', borderColor: '#123456', width: 220, maxHeight: 400 })]))
    })
  })
})
