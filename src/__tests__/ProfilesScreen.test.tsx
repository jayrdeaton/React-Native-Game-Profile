import { useAutoPaperTheme } from '@rific/auto-paper'
import { IconButton } from '@rific/feedback-press'
import { render } from '@testing-library/react'

import { ProfilesManager } from '../ProfilesManager'
import { ProfilesScreen, ProfilesScreenProps } from '../ProfilesScreen'
import { Profile } from '../types'

// ProfilesManager has its own dedicated test suite (ProfilesManager.test.tsx) - this file only
// needs to assert ProfilesScreen's own wiring around it (which props pass straight through
// unchanged, and the container and back button it adds on top), not re-verify ProfilesManager's own
// rendering. Mocked down to a jest.fn() the same way
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
  const onEdit = jest.fn()
  const onBack = jest.fn()
  const utils = render(<ProfilesScreen profiles={[]} onEdit={onEdit} onBack={onBack} {...overrides} />)
  return { ...utils, onEdit, onBack }
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
  it('forwards profiles and onEdit straight through to ProfilesManager', () => {
    const alice = createProfile({ id: 'a', name: 'Alice' })
    const { onEdit } = renderScreen({ profiles: [alice] })

    const props = lastManagerProps()
    expect(props.profiles).toEqual([alice])
    props.onEdit('a')
    expect(onEdit).toHaveBeenCalledWith('a')
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

  it('fg/titleVariant overrides are forwarded straight through to ProfilesManager', () => {
    renderScreen({ fg: '#123123', titleVariant: 'titleLarge' })

    const props = lastManagerProps()
    expect(props.fg).toBe('#123123')
    expect(props.titleVariant).toBe('titleLarge')
    // The back button's own iconColor tracks the resolved fg override too.
    expect(props.headerLeft.props.iconColor).toBe('#123123')
  })

  it("renders a labeled back-arrow IconButton as ProfilesManager's headerLeft that calls onBack", () => {
    const { onBack } = renderScreen()

    const headerLeft = lastManagerProps().headerLeft
    expect(headerLeft.type).toBe(IconButton)
    expect(headerLeft.props.icon).toBe('arrow-left')
    expect(headerLeft.props.accessibilityLabel).toBe('Back')
    headerLeft.props.onPress()
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
