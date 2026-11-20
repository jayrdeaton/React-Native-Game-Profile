import { FadingScrollView, useAutoPaperTheme } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import { act, render } from '@testing-library/react'
import { Text } from 'react-native-paper'

import { NEW_PROFILE_ID } from '../EditProfileScreen'
import { ProfileChip } from '../ProfileChip'
import { ProfilesManager, ProfilesManagerProps } from '../ProfilesManager'
import { Profile } from '../types'

// ProfileChip is the list's only child component - mocked down to a jest.fn() the same way this fleet
// mocks any child, so a row's props to it (which profile, what size) can be asserted directly.
jest.mock('../ProfileChip', () => ({
  ProfileChip: jest.fn(() => null)
}))

// EditProfileScreen is imported for NEW_PROFILE_ID only; its own dependencies (hud, the toaster) are
// stubbed so loading it here doesn't need them. Its own suite is EditProfileScreen.test.tsx.
jest.mock('@tastic/hud/chrome', () => ({
  ConfirmDialog: jest.fn(() => null)
}))

jest.mock('@rific/toaster', () => ({
  useToast: jest.fn()
}))

jest.mock('@rific/auto-paper', () => ({
  useAutoPaperTheme: jest.fn(),
  // A pass-through, like the react-native mock's ScrollView.
  FadingScrollView: jest.fn(({ children }: any) => children ?? null),
  getContrastColor: jest.fn(() => '#FFFFFF'),
  defaultColors: []
}))

jest.mock('@rific/feedback-press', () => {
  const stub = ({ children }: any) => children ?? null
  return {
    Button: jest.fn(stub),
    IconButton: jest.fn(() => null),
    TouchableRipple: jest.fn(stub)
  }
})

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 }))
}))

jest.mock('react-native-paper', () => {
  const stub = ({ children }: any) => children ?? null
  return {
    Icon: jest.fn(() => null),
    Text: jest.fn(stub),
    TextInput: jest.fn(() => null)
  }
})

const mockUseAutoPaperTheme = useAutoPaperTheme as jest.MockedFunction<typeof useAutoPaperTheme>
const mockTouchableRipple = TouchableRipple as jest.MockedFunction<typeof TouchableRipple>
const mockText = Text as jest.MockedFunction<typeof Text>
const mockProfileChip = ProfileChip as jest.MockedFunction<typeof ProfileChip>

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

function flattenText(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in node) return flattenText(node.props?.children)
  return ''
}

function findTouchableRippleByText(text: string): any {
  const calls = mockTouchableRipple.mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    const props = calls[i][0] as any
    if (flattenText(props.children).includes(text)) return props
  }
  throw new Error(`No TouchableRipple renders text "${text}"`)
}

function hasTextContaining(...fragments: string[]): boolean {
  return mockText.mock.calls.some(([props]) => {
    const text = flattenText((props as any).children)
    return fragments.every((fragment) => text.includes(fragment))
  })
}

function renderManager(overrides: Partial<ProfilesManagerProps> = {}) {
  const onEdit = jest.fn()
  const utils = render(<ProfilesManager profiles={[]} onEdit={onEdit} {...overrides} />)
  return { ...utils, onEdit }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseAutoPaperTheme.mockReturnValue({ dark: false } as any)
})

describe('ProfilesManager', () => {
  it('renders the "Profiles" header title and an optional headerLeft slot', () => {
    renderManager({ headerLeft: <Text>BACK</Text> })
    expect(hasTextContaining('Profiles')).toBe(true)
    expect(hasTextContaining('BACK')).toBe(true)
  })

  it('renders every profile as a sorted roster row, plus a trailing New Profile row', () => {
    const charlie = createProfile({ id: 'c', name: 'Charlie' })
    const alice = createProfile({ id: 'a', name: 'Alice' })
    const bob = createProfile({ id: 'b', name: 'Bob' })
    renderManager({ profiles: [charlie, alice, bob] })

    expect(mockProfileChip.mock.calls.map(([props]) => (props as any).profile.name)).toEqual(['Alice', 'Bob', 'Charlie'])
    expect((mockProfileChip.mock.calls[0][0] as any).size).toBe(40)
    expect(mockTouchableRipple.mock.calls.map(([props]) => flattenText((props as any).children))).toEqual(['Alice', 'Bob', 'Charlie', 'New Profile'])
  })

  // The Settings sheet's and the Achievements screen's edge fade, so every scrolling screen in the fleet reads the same.
  it('scrolls its rows in a FadingScrollView with no indicator', () => {
    renderManager({ profiles: [createProfile({ id: 'a', name: 'Alice' })] })
    expect((FadingScrollView as unknown as jest.Mock).mock.lastCall![0].showsVerticalScrollIndicator).toBe(false)
  })

  // The Edit Profile screen is the game's own route (Jay, 2026-11-20): the list only asks for it.
  it("opens a profile's Edit Profile screen through onEdit with its id, and New Profile with NEW_PROFILE_ID", () => {
    const alice = createProfile({ id: 'a', name: 'Alice' })
    const { onEdit } = renderManager({ profiles: [alice] })

    act(() => findTouchableRippleByText('Alice').onPress())
    expect(onEdit).toHaveBeenLastCalledWith('a')

    act(() => findTouchableRippleByText('New Profile').onPress())
    expect(onEdit).toHaveBeenLastCalledWith(NEW_PROFILE_ID)
    expect(onEdit).toHaveBeenCalledTimes(2)
  })

  it('draws its text in fg, black on light and white on dark by default', () => {
    renderManager()
    const title = () =>
      mockText.mock.calls
        .map(([props]) => props as any)
        .filter((props) => flattenText(props.children) === 'Profiles')
        .pop()
    expect(title().style).toEqual(expect.arrayContaining([{ color: '#000000' }]))

    mockUseAutoPaperTheme.mockReturnValue({ dark: true } as any)
    renderManager()
    expect(title().style).toEqual(expect.arrayContaining([{ color: '#FFFFFF' }]))

    renderManager({ fg: '#123123' })
    expect(title().style).toEqual(expect.arrayContaining([{ color: '#123123' }]))
  })
})
