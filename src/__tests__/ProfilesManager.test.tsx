import { useAutoPaperTheme } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import { useToast } from '@rific/toaster'
import { InlineColorPicker } from '@tastic/hud'
import { act, render } from '@testing-library/react'
import { Button, Icon, Text, TextInput } from 'react-native-paper'

import { ProfileChip } from '../ProfileChip'
import { ProfilesManager, ProfilesManagerProps } from '../ProfilesManager'
import { Profile } from '../types'

// ProfileChip is this screen's only child component (see ProfilesManager's own imports) — mocked
// down to a jest.fn() the same way this fleet mocks any child, so a roster row's own props to it
// (which profile, what size) can be asserted directly instead of trying to render through it.
jest.mock('../ProfileChip', () => ({
  ProfileChip: jest.fn(() => null)
}))

// Everything below is a real dependency ProfilesManager pulls in from outside this package
// (@rific/*, @tastic/hud, react-native-safe-area-context) that isn't already mocked by this repo's
// own src/__mocks__ (those only cover 'react-native'/'react-native-paper'). None of it is this
// file's own logic to verify, so each is stubbed down to the same jest.fn() shape this fleet mocks
// react-native-paper's own Icon/Text with — a local jest.mock() here, scoped to this test file only,
// same as ColorPicker.test.tsx in the sibling React-Native-Auto-Paper package does for its own
// one-off '../components/Dialog' mock.
jest.mock('@rific/auto-paper', () => ({
  useAutoPaperTheme: jest.fn()
}))

jest.mock('@rific/feedback-press', () => ({
  TouchableRipple: jest.fn(({ children }: any) => children ?? null)
}))

jest.mock('@rific/toaster', () => ({
  useToast: jest.fn()
}))

jest.mock('@tastic/hud', () => ({
  InlineColorPicker: jest.fn(() => null),
  usePopoverHost: jest.fn(() => ({ openId: null, toggle: jest.fn(), close: jest.fn() }))
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 }))
}))

// This repo's own src/__mocks__/react-native.ts doesn't export KeyboardAvoidingView (nothing else
// tested so far needed it) — ProfilesManager renders one unconditionally, so this file needs its
// own override that adds it, alongside the same View/ScrollView/StyleSheet/Platform stubs the
// shared mock already provides.
jest.mock('react-native', () => {
  const stub = ({ children }: any) => children ?? null
  return {
    StyleSheet: {
      create: (styles: any) => styles,
      flatten: (style: unknown) => style,
      absoluteFill: {},
      hairlineWidth: 1
    },
    Platform: {
      OS: 'ios',
      select: (spec: any) => spec.ios ?? spec.default
    },
    View: jest.fn(stub),
    ScrollView: jest.fn(stub),
    KeyboardAvoidingView: jest.fn(stub)
  }
})

// Likewise, the shared react-native-paper mock only covers Icon/IconButton/Text — ProfilesManager
// also renders Button/Portal/TextInput, so this file needs its own override adding those.
jest.mock('react-native-paper', () => {
  const stub = ({ children }: any) => children ?? null
  return {
    Icon: jest.fn(() => null),
    Text: jest.fn(stub),
    Button: jest.fn(stub),
    Portal: jest.fn(stub),
    TextInput: jest.fn(() => null)
  }
})

const mockUseAutoPaperTheme = useAutoPaperTheme as jest.MockedFunction<typeof useAutoPaperTheme>
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>
const mockTouchableRipple = TouchableRipple as jest.MockedFunction<typeof TouchableRipple>
const mockInlineColorPicker = InlineColorPicker as jest.MockedFunction<typeof InlineColorPicker>
const mockTextInput = TextInput as jest.MockedFunction<typeof TextInput>
const mockButton = Button as jest.MockedFunction<typeof Button>
const mockText = Text as jest.MockedFunction<typeof Text>
const mockIcon = Icon as jest.MockedFunction<typeof Icon>
const mockProfileChip = ProfileChip as jest.MockedFunction<typeof ProfileChip>

const DANGER_COLOR = '#B00020'
const ON_DANGER_COLOR = '#FFFFFF'
const DEFAULT_COLOR = '#00AAFF'

const mockErrorToast = jest.fn()

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

// -- mock-tree inspection helpers ---------------------------------------------------------------
// View/Text/Icon/TouchableRipple/etc are all stubbed down to jest.fn()s above, so — same
// convention as IconButton.test.tsx/ColorPicker.test.tsx in the sibling React-Native-Auto-Paper
// package — a row's own onPress/onChangeText/onSubmitEditing is read straight out of the relevant
// mock's own .mock.calls and invoked directly, rather than trying to query rendered DOM text out
// of an intentionally-flattened tree.

function flattenText(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in node) return flattenText(node.props?.children)
  return ''
}

function findNode(node: any, predicate: (n: any) => boolean): any {
  if (node === null || node === undefined) return null
  if (predicate(node)) return node
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate)
      if (found) return found
    }
    return null
  }
  if (typeof node === 'object' && 'props' in node) return findNode(node.props?.children, predicate)
  return null
}

// Undefined when no such row was ever rendered — used for both "find the row to press" and "assert
// this row isn't there" (e.g. no delete affordance on the 'new' row).
function queryTouchableRippleByText(text: string): any {
  const calls = mockTouchableRipple.mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    const props = calls[i][0] as any
    if (flattenText(props.children).includes(text)) return props
  }
  return undefined
}

function findTouchableRippleByText(text: string): any {
  const found = queryTouchableRippleByText(text)
  if (!found) throw new Error(`No TouchableRipple renders text "${text}"`)
  return found
}

function queryDeleteToggle(): any {
  const calls = mockTouchableRipple.mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    const props = calls[i][0] as any
    if (findNode(props.children, (n) => n?.type === Icon && n?.props?.source === 'trash-can-outline')) return props
  }
  return undefined
}

function lastTextInputProps(placeholder: string): any {
  const calls = mockTextInput.mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    const props = calls[i][0] as any
    if (props.placeholder === placeholder) return props
  }
  throw new Error(`No TextInput renders placeholder "${placeholder}"`)
}

function lastButtonProps(label: string): any {
  const calls = mockButton.mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    const props = calls[i][0] as any
    if (flattenText(props.children) === label) return props
  }
  throw new Error(`No Button renders label "${label}"`)
}

function lastInlineColorPickerValue(): string {
  const calls = mockInlineColorPicker.mock.calls
  return (calls[calls.length - 1][0] as any).value
}

function hasTextContaining(...fragments: string[]): boolean {
  return mockText.mock.calls.some(([props]) => {
    const text = flattenText((props as any).children)
    return fragments.every((fragment) => text.includes(fragment))
  })
}

function renderManager(overrides: Partial<ProfilesManagerProps> = {}) {
  const onCreate = jest.fn()
  const onSave = jest.fn()
  const onDelete = jest.fn()
  const utils = render(<ProfilesManager profiles={[]} defaultColor={DEFAULT_COLOR} onCreate={onCreate} onSave={onSave} onDelete={onDelete} {...overrides} />)
  return { ...utils, onCreate, onSave, onDelete }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseAutoPaperTheme.mockReturnValue({ dark: false, colors: { danger: DANGER_COLOR, onDanger: ON_DANGER_COLOR } } as any)
  mockUseToast.mockReturnValue({ error: mockErrorToast } as any)
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

  it('tapping New Profile opens a blank draft with no delete affordance', () => {
    renderManager()
    act(() => findTouchableRippleByText('New Profile').onPress())

    expect(lastInlineColorPickerValue()).toBe(DEFAULT_COLOR)
    expect(lastTextInputProps('Name').value).toBe('')
    expect(lastTextInputProps('Name').autoFocus).toBe(true)
    expect(lastTextInputProps('Tag').value).toBe('')
    expect(queryDeleteToggle()).toBeUndefined()
  })

  it('tapping an existing profile opens its draft prefilled, with a delete affordance', () => {
    const alice = createProfile({ id: 'a', name: 'Alice', color: '#654321', tag: 'AL' })
    renderManager({ profiles: [alice] })
    act(() => findTouchableRippleByText('Alice').onPress())

    expect(lastInlineColorPickerValue()).toBe('#654321')
    expect(lastTextInputProps('Name').value).toBe('Alice')
    expect(lastTextInputProps('Name').autoFocus).toBeFalsy()
    expect(lastTextInputProps('Tag').value).toBe('AL')
    expect(queryDeleteToggle()).toBeTruthy()
  })

  it('submitting a new profile calls onCreate with its derived tag, then closes the row', () => {
    const { onCreate, onSave } = renderManager()
    act(() => findTouchableRippleByText('New Profile').onPress())
    act(() => lastTextInputProps('Name').onChangeText('Daisy'))
    // Text is always re-rendered on any state change of this component (the header alone
    // guarantees a fresh call every render) — checking it grew is what rules out "submit silently
    // did nothing" rather than "the row closed", which an unchanged InlineColorPicker count alone
    // can't tell apart.
    const textCallsBeforeCommit = mockText.mock.calls.length
    const colorPickerCallsBeforeCommit = mockInlineColorPicker.mock.calls.length

    act(() => lastTextInputProps('Name').onSubmitEditing())

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith({ name: 'Daisy', color: DEFAULT_COLOR, tag: 'D' })
    expect(onSave).not.toHaveBeenCalled()
    expect(mockText.mock.calls.length).toBeGreaterThan(textCallsBeforeCommit)
    // No EditRow left open anywhere — InlineColorPicker only ever renders inside one.
    expect(mockInlineColorPicker.mock.calls.length).toBe(colorPickerCallsBeforeCommit)
  })

  it('deriving the tag from the name stops once the tag field is edited directly', () => {
    const { onCreate } = renderManager()
    act(() => findTouchableRippleByText('New Profile').onPress())

    act(() => lastTextInputProps('Name').onChangeText('Erin'))
    expect(lastTextInputProps('Tag').value).toBe('E')

    act(() => lastTextInputProps('Tag').onChangeText('XY'))
    act(() => lastTextInputProps('Name').onChangeText('Erina'))
    expect(lastTextInputProps('Tag').value).toBe('XY')

    act(() => lastTextInputProps('Name').onSubmitEditing())
    expect(onCreate).toHaveBeenCalledWith({ name: 'Erina', color: DEFAULT_COLOR, tag: 'XY' })
  })

  it('submitting an edited existing profile calls onSave, preserving its already-set tag', () => {
    const alice = createProfile({ id: 'a', name: 'Alice', color: '#654321', tag: 'AL' })
    const { onSave } = renderManager({ profiles: [alice] })
    act(() => findTouchableRippleByText('Alice').onPress())

    act(() => lastTextInputProps('Name').onChangeText('Alicia'))
    act(() => lastTextInputProps('Name').onSubmitEditing())

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('a', { name: 'Alicia', color: '#654321', tag: 'AL' })
  })

  it('drops an invalid tag to empty on save and surfaces an error toast', () => {
    const alice = createProfile({ id: 'a', name: 'Alice', color: '#654321', tag: 'AL' })
    const { onSave } = renderManager({ profiles: [alice] })
    act(() => findTouchableRippleByText('Alice').onPress())

    act(() => lastTextInputProps('Tag').onChangeText('WXYZ'))
    expect(lastTextInputProps('Tag').error).toBe(true)

    act(() => lastTextInputProps('Name').onSubmitEditing())

    expect(mockErrorToast).toHaveBeenCalledWith('Invalid tag', 'Use up to 3 letters or a single emoji')
    expect(onSave).toHaveBeenCalledWith('a', { name: 'Alice', color: '#654321', tag: '' })
  })

  it('submitting an empty name discards the draft without calling onCreate, and closes the row', () => {
    const { onCreate } = renderManager()
    act(() => findTouchableRippleByText('New Profile').onPress())
    const textCallsBeforeCommit = mockText.mock.calls.length
    const colorPickerCallsBeforeCommit = mockInlineColorPicker.mock.calls.length

    act(() => lastTextInputProps('Name').onSubmitEditing())

    expect(onCreate).not.toHaveBeenCalled()
    expect(mockText.mock.calls.length).toBeGreaterThan(textCallsBeforeCommit)
    expect(mockInlineColorPicker.mock.calls.length).toBe(colorPickerCallsBeforeCommit)
    expect(queryTouchableRippleByText('New Profile')).toBeTruthy()
  })

  it('starting to edit a different row commits whatever draft was already open', () => {
    const alice = createProfile({ id: 'a', name: 'Alice', color: '#111111', tag: '' })
    const bob = createProfile({ id: 'b', name: 'Bob', color: '#222222', tag: '' })
    const { onSave } = renderManager({ profiles: [alice, bob] })

    act(() => findTouchableRippleByText('Alice').onPress())
    act(() => lastTextInputProps('Name').onChangeText('Alicia'))
    act(() => findTouchableRippleByText('Bob').onPress())

    expect(onSave).toHaveBeenCalledWith('a', { name: 'Alicia', color: '#111111', tag: 'A' })
    // Bob's own draft is what's open now, not left showing Alice's.
    expect(lastTextInputProps('Name').value).toBe('Bob')
    expect(lastInlineColorPickerValue()).toBe('#222222')
  })

  it('the delete icon opens a confirmation naming the profile', () => {
    const alice = createProfile({ id: 'a', name: 'Alice' })
    renderManager({ profiles: [alice] })
    act(() => findTouchableRippleByText('Alice').onPress())
    act(() => queryDeleteToggle().onPress())

    expect(hasTextContaining('Delete Profile?')).toBe(true)
    expect(hasTextContaining('permanently deletes', 'Alice')).toBe(true)
    const alertIcon = mockIcon.mock.calls.find(([props]) => (props as any).source === 'alert-outline')
    expect((alertIcon?.[0] as any).color).toBe(DANGER_COLOR)
  })

  it('cancelling the delete confirmation leaves the profile untouched', () => {
    const alice = createProfile({ id: 'a', name: 'Alice' })
    const { onDelete } = renderManager({ profiles: [alice] })
    act(() => findTouchableRippleByText('Alice').onPress())
    act(() => queryDeleteToggle().onPress())
    // Cancel and Delete (react-native-paper's Button) only ever render inside the confirmation
    // overlay itself — its call count only grows while that overlay is on screen. Text is on the
    // other hand always re-rendered on any state change (the header alone guarantees a fresh call
    // every render) — checking it grew is what rules out "Cancel's onPress silently did nothing"
    // rather than "the overlay closed", which a same-Button-count reading alone can't tell apart.
    const textCallsBeforeCancel = mockText.mock.calls.length
    const buttonCallsBeforeCancel = mockButton.mock.calls.length

    act(() => lastButtonProps('Cancel').onPress())

    expect(onDelete).not.toHaveBeenCalled()
    expect(mockText.mock.calls.length).toBeGreaterThan(textCallsBeforeCancel)
    expect(mockButton.mock.calls.length).toBe(buttonCallsBeforeCancel)
  })

  it('confirming delete calls onDelete and closes the row that was being edited', () => {
    const alice = createProfile({ id: 'a', name: 'Alice' })
    const { onDelete } = renderManager({ profiles: [alice] })
    act(() => findTouchableRippleByText('Alice').onPress())
    act(() => queryDeleteToggle().onPress())
    const colorPickerCallsBeforeCommit = mockInlineColorPicker.mock.calls.length
    const textCallsBeforeConfirm = mockText.mock.calls.length
    const buttonCallsBeforeConfirm = mockButton.mock.calls.length

    act(() => lastButtonProps('Delete').onPress())

    expect(onDelete).toHaveBeenCalledWith('a')
    expect(mockText.mock.calls.length).toBeGreaterThan(textCallsBeforeConfirm)
    expect(mockButton.mock.calls.length).toBe(buttonCallsBeforeConfirm)
    // The row being edited when its own delete was confirmed closes along with it.
    expect(mockInlineColorPicker.mock.calls.length).toBe(colorPickerCallsBeforeCommit)
  })

  it('unmounting mid-edit flushes the pending draft through onSave', () => {
    const alice = createProfile({ id: 'a', name: 'Alice', color: '#111111', tag: '' })
    const { onSave, unmount } = renderManager({ profiles: [alice] })
    act(() => findTouchableRippleByText('Alice').onPress())
    act(() => lastTextInputProps('Name').onChangeText('Alicia'))

    unmount()

    expect(onSave).toHaveBeenCalledWith('a', { name: 'Alicia', color: '#111111', tag: 'A' })
  })
})
