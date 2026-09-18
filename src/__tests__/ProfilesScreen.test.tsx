import { useAutoPaperTheme } from '@rific/auto-paper'
import { IconButton } from '@rific/feedback-press'
import { render } from '@testing-library/react'

import { ProfilesManager } from '../ProfilesManager'
import { ProfilesScreen, ProfilesScreenProps } from '../ProfilesScreen'
import { Profile } from '../types'

// ProfilesManager has its own dedicated test suite (ProfilesManager.test.tsx) — this file only
// needs to assert ProfilesScreen's own wiring around it (which props pass straight through
// unchanged, and the container/back-button/commit-before-navigate composition it adds on top), not
// re-verify ProfilesManager's own rendering. Mocked down to a jest.fn() the same way
// ProfilePicker.test.tsx mocks its own sibling ProfileChip.
jest.mock('../ProfilesManager', () => ({
  ProfilesManager: jest.fn(() => null)
}))

// Real @rific/auto-paper throws at module-load time against this package's own stubbed
// react-native-paper mock (see ProfilesManager.test.tsx's identical comment on the same mock).
jest.mock('@rific/auto-paper', () => ({
  useAutoPaperTheme: jest.fn()
}))

// Real @rific/feedback-press unconditionally require()s expo-haptics, which isn't a dependency of
// this package (see ProfilePicker.test.tsx's identical comment on the same mock). headerLeft is
// asserted below as a plain React element (`.type`/`.props`), not by rendering it, since
// ProfilesManager is itself mocked to `() => null` and never renders the headerLeft it's handed.
jest.mock('@rific/feedback-press', () => ({
  IconButton: jest.fn(() => null)
}))

const mockUseAutoPaperTheme = useAutoPaperTheme as jest.MockedFunction<typeof useAutoPaperTheme>
const mockProfilesManager = ProfilesManager as jest.MockedFunction<typeof ProfilesManager>

const DEFAULT_COLOR = '#00AAFF'

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-id',
    name: 'Profile',
    color: '#123456',
    tag: '',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides
  }
}

function renderScreen(overrides: Partial<ProfilesScreenProps> = {}) {
  const onCreate = jest.fn()
  const onSave = jest.fn()
  const onDelete = jest.fn()
  const onBack = jest.fn()
  const utils = render(<ProfilesScreen profiles={[]} defaultColor={DEFAULT_COLOR} onCreate={onCreate} onSave={onSave} onDelete={onDelete} onBack={onBack} {...overrides} />)
  return { ...utils, onCreate, onSave, onDelete, onBack }
}

function lastManagerProps(): any {
  const calls = mockProfilesManager.mock.calls
  return calls[calls.length - 1][0]
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseAutoPaperTheme.mockReturnValue({ dark: false } as any)
})

describe('ProfilesScreen', () => {
  it('forwards profiles/defaultColor straight through to ProfilesManager', () => {
    const alice = createProfile({ id: 'a', name: 'Alice' })
    renderScreen({ profiles: [alice] })

    const props = lastManagerProps()
    expect(props.profiles).toEqual([alice])
    expect(props.defaultColor).toBe(DEFAULT_COLOR)
  })

  it('forwards onCreate/onSave/onDelete straight through, with the caller-given patch/id shape untouched', () => {
    const { onCreate, onSave, onDelete } = renderScreen()
    const props = lastManagerProps()

    props.onCreate({ name: 'New', color: '#000000', tag: 'N' })
    expect(onCreate).toHaveBeenCalledWith({ name: 'New', color: '#000000', tag: 'N' })

    props.onSave('a', { name: 'Alicia', color: '#111111', tag: 'A' })
    expect(onSave).toHaveBeenCalledWith('a', { name: 'Alicia', color: '#111111', tag: 'A' })

    props.onDelete('a')
    expect(onDelete).toHaveBeenCalledWith('a')
  })

  it('defaults fg/bg to black-on-white in light mode, and resolves the same fg for both the back button and ProfilesManager', () => {
    mockUseAutoPaperTheme.mockReturnValue({ dark: false } as any)
    renderScreen()

    const props = lastManagerProps()
    expect(props.fg).toBe('#000000')
    expect(props.headerLeft.props.iconColor).toBe('#000000')
  })

  it('defaults fg/bg to white-on-black in dark mode', () => {
    mockUseAutoPaperTheme.mockReturnValue({ dark: true } as any)
    renderScreen()

    const props = lastManagerProps()
    expect(props.fg).toBe('#FFFFFF')
    expect(props.headerLeft.props.iconColor).toBe('#FFFFFF')
  })

  it('fg/fgMuted/cardBg/titleVariant/colorPreview overrides are forwarded straight through to ProfilesManager', () => {
    const colorPreview = jest.fn()
    renderScreen({ fg: '#123123', fgMuted: '#456456', cardBg: '#abcabc', titleVariant: 'titleLarge', colorPreview })

    const props = lastManagerProps()
    expect(props.fg).toBe('#123123')
    expect(props.fgMuted).toBe('#456456')
    expect(props.cardBg).toBe('#abcabc')
    expect(props.titleVariant).toBe('titleLarge')
    expect(props.colorPreview).toBe(colorPreview)
    // The back button's own iconColor tracks the resolved fg override too, same as the light/dark
    // default case above.
    expect(props.headerLeft.props.iconColor).toBe('#123123')
  })

  it("renders a labeled back-arrow IconButton as ProfilesManager's headerLeft", () => {
    renderScreen()

    const headerLeft = lastManagerProps().headerLeft
    expect(headerLeft.type).toBe(IconButton)
    expect(headerLeft.props.icon).toBe('arrow-left')
    expect(headerLeft.props.accessibilityLabel).toBe('Back')
  })

  it('the back button commits any pending edit through the ProfilesManager ref, then calls onBack', () => {
    const commitPendingEdit = jest.fn()
    const { onBack } = renderScreen()
    const props = lastManagerProps()

    // Simulates ProfilesManager's own useImperativeHandle attaching its handle to the ref
    // ProfilesScreen owns and passes down — see ProfilesManager.tsx's own ref wiring.
    props.ref.current = { commitPendingEdit }

    props.headerLeft.props.onPress()

    expect(commitPendingEdit).toHaveBeenCalledTimes(1)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(commitPendingEdit.mock.invocationCallOrder[0]).toBeLessThan(onBack.mock.invocationCallOrder[0])
  })

  it('the back button is a safe no-op on the ref when ProfilesManager has not attached a handle yet', () => {
    const { onBack } = renderScreen()
    const props = lastManagerProps()

    expect(() => props.headerLeft.props.onPress()).not.toThrow()
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
