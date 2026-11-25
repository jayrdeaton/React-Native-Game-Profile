import { useAutoPaperTheme } from '@rific/auto-paper'
import { Button, IconButton } from '@rific/feedback-press'
import { useToast } from '@rific/toaster'
import { ConfirmDialog, useLettering } from '@tastic/hud/chrome'
import { act, render } from '@testing-library/react'
import { createRef } from 'react'
import { View } from 'react-native'
import { Text, TextInput } from 'react-native-paper'

import { EDIT_CHIP_SIZE, EDIT_FORM_MAX_WIDTH, editSwatches, gridColumns, gridLayout, NAME_HINT, SWATCH_MAX, SWATCH_MIN, SWATCH_MIN_GAP, TAG_HINT } from '../EditProfile'
import { EditProfileScreen, EditProfileScreenHandle, EditProfileScreenProps, NEW_PROFILE_ID } from '../EditProfileScreen'
import { EditProfileRow, EditProfileSection } from '../EditProfileSection'
import { IdentityChip } from '../IdentityChip'
import { ProfileColorProvider } from '../ProfileColorContext'
import { Profile } from '../types'

// The big chip is mocked down to a jest.fn() the same way this fleet mocks any child, so what it's
// handed (color, tag, size) can be asserted directly (ProfileChip.test.tsx covers the drawing).
jest.mock('../IdentityChip', () => ({
  IdentityChip: jest.fn(() => null)
}))

// Everything below is a real dependency the screen pulls in from outside this package that isn't
// already mocked by this repo's own src/__mocks__ (those only cover 'react-native'/'react-native-paper'),
// stubbed down to jest.fn()s scoped to this file. @rific/focus-chain is the real one: the Return order
// Name then Tag is this screen's own wiring.
jest.mock('@rific/auto-paper', () => ({
  useAutoPaperTheme: jest.fn(),
  // A pass-through, like the react-native mock's ScrollView below.
  FadingScrollView: jest.fn(({ children }: any) => children ?? null),
  getContrastColor: jest.fn(() => '#FFFFFF'),
  // 20, like the real default list, with the real list's shape.
  defaultColors: Array.from({ length: 20 }, (_, i) => ({ label: `Color ${i}`, value: `#0000${String(i).padStart(2, '0')}` }))
}))

jest.mock('@rific/feedback-press', () => {
  const stub = ({ children }: any) => children ?? null
  return {
    Button: jest.fn(stub),
    IconButton: jest.fn(() => null),
    TouchableRipple: jest.fn(stub)
  }
})

jest.mock('@rific/toaster', () => ({
  useToast: jest.fn()
}))

jest.mock('@tastic/hud/chrome', () => ({
  // hud's real confirm card (its own tests cover it); here only the props it was handed matter.
  ConfirmDialog: jest.fn(() => null),
  // What a game's LetteringProvider holds: nothing, unless a test hands it a title or a label.
  useLettering: jest.fn(() => ({}))
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 }))
}))

// This repo's own src/__mocks__/react-native.ts doesn't export KeyboardAvoidingView (nothing else
// tested needs it), so this file has its own, alongside the same View/ScrollView/StyleSheet/Platform
// stubs the shared mock provides.
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
    KeyboardAvoidingView: jest.fn(stub),
    useWindowDimensions: jest.fn(() => ({ width: 402, height: 874, scale: 3, fontScale: 1 }))
  }
})

// Likewise, the shared react-native-paper mock only covers Icon/IconButton/Text - this screen also
// renders TextInput.
jest.mock('react-native-paper', () => {
  const stub = ({ children }: any) => children ?? null
  return {
    Icon: jest.fn(() => null),
    Text: jest.fn(stub),
    TextInput: jest.fn(() => null)
  }
})

const mockUseAutoPaperTheme = useAutoPaperTheme as jest.MockedFunction<typeof useAutoPaperTheme>
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>
const mockIconButton = IconButton as jest.MockedFunction<typeof IconButton>
const mockButton = Button as jest.MockedFunction<typeof Button>
const mockTextInput = TextInput as jest.MockedFunction<typeof TextInput>
const mockText = Text as jest.MockedFunction<typeof Text>
const mockView = View as unknown as jest.Mock
const mockIdentityChip = IdentityChip as jest.MockedFunction<typeof IdentityChip>

const PRIMARY_COLOR = '#3366FF'
const DANGER_COLOR = '#B00020'
const DEFAULT_COLOR = '#00AAFF'
// One of the mocked palette's colors.
const PALETTE_COLOR = '#000007'

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
// View/Text/TouchableRipple/etc are all stubbed down to jest.fn()s above, so a control's own
// onPress/onChangeText/onSubmitEditing is read straight out of the relevant mock's .mock.calls and
// invoked directly, rather than querying rendered DOM text out of an intentionally-flattened tree.

function flattenText(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in node) return flattenText(node.props?.children)
  return ''
}

// The props of the last call to `mock` that `predicate` accepts.
function findLastProps(mock: jest.Mock | jest.MockedFunction<any>, predicate: (props: any) => boolean): any {
  const calls = mock.mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    const props = calls[i][0] as any
    if (predicate(props)) return props
  }
  return undefined
}

const flat = (style: any): Record<string, any> => (Array.isArray(style) ? style.reduce((merged: Record<string, any>, part: any) => ({ ...merged, ...flat(part) }), {}) : style || {})

function lastTitle(): string | undefined {
  const props = findLastProps(mockText, (p) => p.variant === 'headlineSmall')
  return props && flattenText(props.children)
}

function lastTextInputProps(label: string): any {
  const props = findLastProps(mockTextInput, (p) => p.accessibilityLabel === label)
  if (!props) throw new Error(`No TextInput labelled "${label}"`)
  return props
}

function lastButton(label: string): any {
  return findLastProps(mockButton, (props) => flattenText(props.children) === label)
}

function lastBackArrow(): any {
  return findLastProps(mockIconButton, (props) => props.accessibilityLabel === 'Back')
}

function lastConfirmProps(): any {
  return (ConfirmDialog as jest.Mock).mock.lastCall![0]
}

function hasTextContaining(...fragments: string[]): boolean {
  return mockText.mock.calls.some(([props]) => {
    const text = flattenText((props as any).children)
    return fragments.every((fragment) => text.includes(fragment))
  })
}

function lastChipProps(): any {
  return mockIdentityChip.mock.lastCall![0]
}

// The color grid as last rendered, and its swatches read off it (a measured width re-renders the
// grid alone, so a log of every swatch rendered would hold it twice).
function lastGrid(): any {
  return findLastProps(mockView, (props) => props.accessibilityRole === 'radiogroup')
}

function lastSwatches(): any[] {
  return lastGrid().children.flatMap((row: any) => row.props.children.map((swatch: any) => swatch.props))
}

function swatchLabelled(label: string): any {
  const found = lastSwatches().find((props) => props.accessibilityLabel === label)
  if (!found) throw new Error(`No swatch labelled "${label}"`)
  return found
}

function selectedSwatchLabels(): string[] {
  return lastSwatches()
    .filter((props) => props.accessibilityState.selected)
    .map((props) => props.accessibilityLabel)
}

const ALICE = createProfile({ id: 'a', name: 'Alice', color: '#111111', tag: '' })

function renderScreen(overrides: Partial<EditProfileScreenProps> = {}) {
  const onCreate = jest.fn()
  const onSave = jest.fn()
  const onDelete = jest.fn()
  const onBack = jest.fn()
  const props: EditProfileScreenProps = { profileId: NEW_PROFILE_ID, profiles: [ALICE], defaultColor: DEFAULT_COLOR, onCreate, onSave, onDelete, onBack, ...overrides }
  const utils = render(<EditProfileScreen {...props} />)
  return { ...utils, props, onCreate, onSave, onDelete, onBack }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseAutoPaperTheme.mockReturnValue({ dark: false, colors: { primary: PRIMARY_COLOR, danger: DANGER_COLOR } } as any)
  mockUseToast.mockReturnValue({ error: mockErrorToast } as any)
})

describe('EditProfileScreen: opening', () => {
  it('opens a new profile blank, titled "New Profile", with Done, its name focused and no Delete Profile', () => {
    renderScreen()

    expect(NEW_PROFILE_ID).toBe('new')
    expect(lastTitle()).toBe('New Profile')
    expect(lastBackArrow()).toMatchObject({ icon: 'arrow-left', size: 24 })
    expect(lastButton('Done')).toMatchObject({ mode: 'text', textColor: PRIMARY_COLOR })
    expect(lastTextInputProps('Name')).toMatchObject({ value: '', autoFocus: true })
    expect(lastTextInputProps('Tag').value).toBe('')
    expect(lastButton('Delete Profile')).toBeUndefined()
  })

  it('opens a saved profile prefilled, titled "Edit Profile", its name not focused, with Delete Profile', () => {
    const bob = createProfile({ id: 'b', name: 'Bob', color: PALETTE_COLOR, tag: 'BO' })
    renderScreen({ profileId: 'b', profiles: [ALICE, bob] })

    expect(lastTitle()).toBe('Edit Profile')
    expect(lastTextInputProps('Name').value).toBe('Bob')
    expect(lastTextInputProps('Name').autoFocus).toBeFalsy()
    expect(lastTextInputProps('Tag').value).toBe('BO')
    expect(lastChipProps().color).toBe(PALETTE_COLOR)
    expect(lastButton('Delete Profile')).toMatchObject({ mode: 'outlined', icon: 'trash-can-outline', textColor: DANGER_COLOR })
  })

  it("draws on ProfilesScreen's background by default, or the host's", () => {
    const { unmount } = renderScreen()
    const container = () => findLastProps(mockView, (props) => Array.isArray(props.style) && flat(props.style).backgroundColor !== undefined && flat(props.style).flex === 1)
    expect(flat(container().style).backgroundColor).toBe('#FFFFFF')
    unmount()

    mockUseAutoPaperTheme.mockReturnValue({ dark: true, colors: { primary: PRIMARY_COLOR, danger: DANGER_COLOR } } as any)
    renderScreen({ bg: 'transparent' })
    expect(flat(container().style).backgroundColor).toBe('transparent')
    expect(lastBackArrow().iconColor).toBe('#FFFFFF')
  })

  it('holds the form to a centered column in a wide window', () => {
    renderScreen()
    const form = findLastProps(mockView, (props) => flat(props.style).maxWidth !== undefined)
    expect(flat(form.style)).toMatchObject({ maxWidth: EDIT_FORM_MAX_WIDTH, alignSelf: 'center', width: '100%' })
  })

  // A stale link, or a profile deleted in another app while this one was open.
  it('leaves at once, saving nothing, for an id the roster does not have', () => {
    const { onBack, onSave, onCreate, unmount } = renderScreen({ profileId: 'gone' })

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(mockTextInput).not.toHaveBeenCalled()
    unmount()
    expect(onSave).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('leaves once, saving nothing, when the profile is deleted elsewhere while it is open', () => {
    const { onBack, onSave, rerender, props } = renderScreen({ profileId: 'a' })
    act(() => lastTextInputProps('Name').onChangeText('Alicia'))

    rerender(<EditProfileScreen {...props} profiles={[]} />)
    rerender(<EditProfileScreen {...props} profiles={[]} />)

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })
})

// A game's own title lettering (hud's LetteringProvider: DuelTastic's Orbitron, AlphaTastic's sketch
// font), laid over the title's own type, as the roster's title (ProfilesManager) and hud's BaseStatsScreen.
describe("EditProfileScreen: the title's lettering", () => {
  const titleProps = (title: string) => findLastProps(mockText, (props) => flattenText(props.children) === title)
  const LETTERING = { fontFamily: 'Orbitron_700Bold', fontWeight: 'normal' as const }

  afterEach(() => {
    jest.mocked(useLettering).mockReturnValue({})
  })

  it('is the plain titleVariant type without a game lettering', () => {
    renderScreen()
    const props = titleProps('New Profile')
    expect(props.variant).toBe('headlineSmall')
    expect([props.style].flat(Infinity).filter(Boolean)).toEqual([{ flex: 1, fontWeight: 'bold' }, { color: '#000000' }])
  })

  it("carries the game's title lettering over its own type, after its color, new or saved", () => {
    jest.mocked(useLettering).mockReturnValue({ title: LETTERING })
    const expectLettered = (title: string) => {
      const props = titleProps(title)
      expect(props.variant).toBe('titleLarge')
      const style = [props.style].flat(Infinity)
      expect(style).toContainEqual(LETTERING)
      expect(style.indexOf(LETTERING)).toBeGreaterThan(style.findIndex((entry: any) => entry?.color === '#000000'))
    }

    const { unmount } = renderScreen({ titleVariant: 'titleLarge' })
    expectLettered('New Profile')
    unmount()
    renderScreen({ profileId: 'a', titleVariant: 'titleLarge' })
    expectLettered('Edit Profile')
  })

  it('letters only the title, not the section labels or hints', () => {
    jest.mocked(useLettering).mockReturnValue({ title: LETTERING })
    renderScreen({ profileId: 'a' })
    const lettered = mockText.mock.calls.map(([props]) => props as any).filter((props) => [props.style].flat(Infinity).includes(LETTERING))
    expect(new Set(lettered.map((props) => flattenText(props.children)))).toEqual(new Set(['Edit Profile']))
  })
})

// A game's own label lettering (hud's LetteringProvider, the pack's labelStyle in @tastic/shell: AlphaTastic's
// sketch capitals), laid over Edit Profile's small capital headings, its own (Name, Tag, Color) and a game's
// (EditProfileSection's), as hud's StatSection and Settings sheet letter their section labels.
describe("EditProfileScreen: the headings' lettering", () => {
  // AlphaTastic's labelType.
  const LABEL = { fontFamily: 'AlphaSketchBold', fontWeight: 'normal' as const, textTransform: 'uppercase' as const, fontSize: 14, lineHeight: 20, letterSpacing: 0 }
  const HEADING_TYPE = { fontSize: 12, fontWeight: '700', letterSpacing: 1 }
  const HEADINGS = ['NAME', 'TAG', 'COLOR', 'ONLINE']
  // A game's own section, as @tastic/profile/online's ProfileOnlineSection draws it.
  const onlineSection = () => (
    <EditProfileSection label='Online'>
      <EditProfileRow icon='earth' label='Show on Public Boards' caption='Strangers see your tag' />
    </EditProfileSection>
  )
  const headingStyle = (heading: string) => [findLastProps(mockText, (props) => props.accessibilityRole === 'header' && flattenText(props.children) === heading)?.style].flat(Infinity).filter(Boolean)

  afterEach(() => {
    jest.mocked(useLettering).mockReturnValue({})
  })

  it('are small bold capitals in the muted color without a game lettering', () => {
    renderScreen({ profileId: 'a', fgMuted: '#999999', sections: onlineSection })
    for (const heading of HEADINGS) expect(headingStyle(heading)).toEqual([HEADING_TYPE, { color: '#999999' }])
  })

  it('stay as they are with only a title lettering', () => {
    jest.mocked(useLettering).mockReturnValue({ title: { fontFamily: 'Orbitron_700Bold' } })
    renderScreen({ profileId: 'a', fgMuted: '#999999', sections: onlineSection })
    for (const heading of HEADINGS) expect(headingStyle(heading)).toEqual([HEADING_TYPE, { color: '#999999' }])
  })

  it("carry the game's label lettering over their own type, after their color, Edit Profile's and a game's alike", () => {
    jest.mocked(useLettering).mockReturnValue({ label: LABEL })
    renderScreen({ profileId: 'a', fgMuted: '#999999', sections: onlineSection })
    for (const heading of HEADINGS) expect(headingStyle(heading)).toEqual([HEADING_TYPE, { color: '#999999' }, LABEL])
  })

  it("letters only the headings, not the title, the hints or a section's rows", () => {
    jest.mocked(useLettering).mockReturnValue({ label: LABEL })
    renderScreen({ profileId: 'a', sections: onlineSection })
    const lettered = mockText.mock.calls.map(([props]) => props as any).filter((props) => [props.style].flat(Infinity).includes(LABEL))
    expect(new Set(lettered.map((props) => flattenText(props.children)))).toEqual(new Set(HEADINGS))
    expect(hasTextContaining('Show on Public Boards')).toBe(true)
  })

  it('letters a section drawn outside the screen too, in the muted color by appearance', () => {
    jest.mocked(useLettering).mockReturnValue({ label: LABEL })
    render(onlineSection())
    expect(headingStyle('ONLINE')).toEqual([HEADING_TYPE, { color: 'rgba(0,0,0,0.5)' }, LABEL])
  })
})

describe('EditProfileScreen: the name', () => {
  // The tag hint's pair (Jay, 2026-11-20): strangers see the tag, only friends you invite the name.
  it('has a hint under it saying who sees the name, worded the same in every game', () => {
    renderScreen({ fgMuted: '#999999' })

    expect(NAME_HINT).toBe('Only friends you invite online see your name.')
    expect(lastTextInputProps('Name').accessibilityHint).toBe(NAME_HINT)
    expect(hasTextContaining('NAME')).toBe(true)
    const hint = findLastProps(mockText, (props) => flattenText(props.children) === NAME_HINT)
    expect(flat(hint.style)).toMatchObject({ color: '#999999', fontSize: 13, lineHeight: 18 })
    // Styled like the tag's hint.
    const tagHint = findLastProps(mockText, (props) => flattenText(props.children) === TAG_HINT)
    expect(hint.style[0]).toBe(tagHint.style[0])
  })

  it('shows the hint for a saved profile too, muted whatever the tag', () => {
    const al = createProfile({ id: 'a', name: 'Alice', color: '#654321', tag: 'WXYZ' })
    renderScreen({ profileId: 'a', profiles: [al], fgMuted: '#999999' })

    const hint = findLastProps(mockText, (props) => flattenText(props.children) === NAME_HINT)
    expect(flat(hint.style).color).toBe('#999999')
  })
})

describe('EditProfileScreen: the tag', () => {
  // The tag used to be typed into a field nobody could see, behind the color circle.
  it('is a field you can see, labelled, with a hint saying what it takes and what it is for', () => {
    renderScreen()

    const tag = lastTextInputProps('Tag')
    expect(tag.pointerEvents).toBeUndefined()
    expect(tag.mode).toBe('outlined')
    expect(tag.accessibilityHint).toBe(TAG_HINT)
    expect(hasTextContaining('TAG')).toBe(true)
    expect(hasTextContaining('Up to 3 letters or an emoji', 'strangers', 'instead of your name')).toBe(true)
    // Worded for a game with no leaderboards too: where strangers can see you, not that they do.
    expect(TAG_HINT).toContain('Wherever strangers can see you')
  })

  it('follows the name’s first letter until it is typed into', () => {
    const { onCreate } = renderScreen()

    act(() => lastTextInputProps('Name').onChangeText('Erin'))
    expect(lastTextInputProps('Tag').value).toBe('E')

    act(() => lastTextInputProps('Tag').onChangeText('XY'))
    act(() => lastTextInputProps('Name').onChangeText('Erina'))
    expect(lastTextInputProps('Tag').value).toBe('XY')

    act(() => lastButton('Done').onPress())
    expect(onCreate).toHaveBeenCalledWith({ name: 'Erina', color: DEFAULT_COLOR, tag: 'XY' })
  })

  it('keeps a saved tag when the name changes', () => {
    const al = createProfile({ id: 'a', name: 'Alice', color: '#654321', tag: 'AL' })
    const { onSave } = renderScreen({ profileId: 'a', profiles: [al] })

    act(() => lastTextInputProps('Name').onChangeText('Alicia'))
    act(() => lastButton('Done').onPress())

    expect(onSave).toHaveBeenCalledWith('a', { name: 'Alicia', color: '#654321', tag: 'AL' })
  })

  it("clamps the field's live typing - rejects a keystroke past 3 characters, and a second emoji replaces the first", () => {
    renderScreen()

    act(() => lastTextInputProps('Tag').onChangeText('ABC'))
    expect(lastTextInputProps('Tag').value).toBe('ABC')
    act(() => lastTextInputProps('Tag').onChangeText('ABCD'))
    expect(lastTextInputProps('Tag').value).toBe('ABC')

    act(() => lastTextInputProps('Tag').onChangeText('😎'))
    expect(lastTextInputProps('Tag').value).toBe('😎')
    act(() => lastTextInputProps('Tag').onChangeText('😎🔥'))
    expect(lastTextInputProps('Tag').value).toBe('🔥')
  })

  // A full tag refuses a 4th letter (clampTag), so a tap and a letter must start it over.
  it('selects its text on focus, takes capitals, and has no autocorrect', () => {
    renderScreen()
    expect(lastTextInputProps('Tag')).toMatchObject({ selectTextOnFocus: true, autoCapitalize: 'characters', autoCorrect: false })
  })

  // One letter or emoji at the left of the 120 wide field looked lost; centered, it sits as it does on the chip.
  it('centers its text in the field', () => {
    renderScreen()
    expect(flat(lastTextInputProps('Tag').contentStyle).textAlign).toBe('center')
  })

  // clampTag keeps the field from typing its way into an invalid tag, so this is one loaded from
  // storage: a legacy value, or one synced in from another app's looser rules.
  it('shows an invalid stored tag as an error, leaves it off the chip, and drops it with a toast on Done', () => {
    const al = createProfile({ id: 'a', name: 'Alice', color: '#654321', tag: 'WXYZ' })
    const { onSave } = renderScreen({ profileId: 'a', profiles: [al] })

    expect(lastTextInputProps('Tag').error).toBe(true)
    const hint = findLastProps(mockText, (props) => flattenText(props.children) === TAG_HINT)
    expect(flat(hint.style).color).toBe(DANGER_COLOR)
    expect(lastChipProps().tag).toBe('')

    act(() => lastButton('Done').onPress())
    expect(mockErrorToast).toHaveBeenCalledWith('Invalid tag', 'Use up to 3 letters or a single emoji')
    expect(onSave).toHaveBeenCalledWith('a', { name: 'Alice', color: '#654321', tag: '' })
  })

  it('shows a valid tag with no error, its hint muted', () => {
    renderScreen({ fgMuted: '#999999' })
    act(() => lastTextInputProps('Tag').onChangeText('JD'))

    expect(lastTextInputProps('Tag').error).toBe(false)
    const hint = findLastProps(mockText, (props) => flattenText(props.children) === TAG_HINT)
    expect(flat(hint.style).color).toBe('#999999')
  })
})

describe('EditProfileScreen: saving and leaving', () => {
  // tag.ref is captured straight off TextInput's mocked props - React 19 passes `ref` through as a
  // normal prop to a plain function component, as @rific/focus-chain's own tests do with a fake.
  it("Return in Name moves to Tag, and Tag's Return saves and leaves", () => {
    const { onCreate, onBack } = renderScreen()
    const focusTag = jest.fn()
    lastTextInputProps('Tag').ref({ focus: focusTag })
    act(() => lastTextInputProps('Name').onChangeText('Daisy'))

    expect(lastTextInputProps('Name').returnKeyType).toBe('next')
    act(() => lastTextInputProps('Name').onSubmitEditing())
    expect(focusTag).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()

    expect(lastTextInputProps('Tag').returnKeyType).toBe('done')
    act(() => lastTextInputProps('Tag').onSubmitEditing())
    expect(onCreate).toHaveBeenCalledWith({ name: 'Daisy', color: DEFAULT_COLOR, tag: 'D' })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  // The route unmounts the screen after onBack: a new profile must not be made twice.
  it('Done makes a new profile once, then leaves', () => {
    const { onCreate, onSave, onBack, unmount } = renderScreen()
    act(() => lastTextInputProps('Name').onChangeText('Daisy'))

    act(() => lastButton('Done').onPress())
    unmount()

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith({ name: 'Daisy', color: DEFAULT_COLOR, tag: 'D' })
    expect(onSave).not.toHaveBeenCalled()
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onCreate.mock.invocationCallOrder[0]).toBeLessThan(onBack.mock.invocationCallOrder[0])
  })

  // Jay: the back arrow, Done and swipe back all save.
  it('the back arrow saves too, then leaves', () => {
    const { onSave, onBack, unmount } = renderScreen({ profileId: 'a' })
    act(() => lastTextInputProps('Name').onChangeText('Alicia'))

    act(() => lastBackArrow().onPress())
    unmount()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('a', { name: 'Alicia', color: '#111111', tag: 'A' })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  // A swipe back, Android's back button or the browser's back leave through the router: the screen
  // unmounts without onBack, and saves as it goes.
  it('saves as it unmounts when it was left without its own buttons', () => {
    const { onSave, onBack, unmount } = renderScreen({ profileId: 'a' })
    act(() => lastTextInputProps('Name').onChangeText('Alicia'))

    unmount()

    expect(onSave).toHaveBeenCalledWith('a', { name: 'Alicia', color: '#111111', tag: 'A' })
    expect(onBack).not.toHaveBeenCalled()
  })

  it('saves nothing for a saved profile left as it was', () => {
    const { onSave, onBack, unmount } = renderScreen({ profileId: 'a' })

    act(() => lastButton('Done').onPress())
    unmount()

    expect(onSave).not.toHaveBeenCalled()
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('saves nothing for an empty name, and still leaves', () => {
    const { onCreate, onBack, unmount } = renderScreen()

    act(() => lastButton('Done').onPress())
    unmount()

    expect(onCreate).not.toHaveBeenCalled()
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  // For a router that keeps a screen it has left mounted: the route calls this as it loses focus.
  it('commitPendingEdit saves the draft once, and the unmount after saves nothing more', () => {
    const ref = createRef<EditProfileScreenHandle>()
    const { onSave, onBack, unmount } = renderScreen({ profileId: 'a', ref })
    act(() => lastTextInputProps('Name').onChangeText('Alicia'))

    act(() => ref.current?.commitPendingEdit())
    unmount()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('a', { name: 'Alicia', color: '#111111', tag: 'A' })
    expect(onBack).not.toHaveBeenCalled()
  })

  it('commitPendingEdit is a safe no-op with nothing to save', () => {
    const ref = createRef<EditProfileScreenHandle>()
    const { onCreate, onSave } = renderScreen({ ref })

    expect(() => act(() => ref.current?.commitPendingEdit())).not.toThrow()
    expect(onCreate).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('a saved profile reopened starts from its saved values', () => {
    const al = createProfile({ id: 'a', name: 'Alicia', color: PALETTE_COLOR, tag: 'AC' })
    renderScreen({ profileId: 'a', profiles: [al] })

    expect(lastTextInputProps('Name').value).toBe('Alicia')
    expect(lastTextInputProps('Tag').value).toBe('AC')
    expect(selectedSwatchLabels()).toEqual(['Color 7'])
  })
})

describe('EditProfileScreen: the chip', () => {
  it('shows the profile big at the top as it will look: its color and tag, live', () => {
    renderScreen()
    expect(lastChipProps()).toMatchObject({ color: DEFAULT_COLOR, tag: '', icon: 'account', size: EDIT_CHIP_SIZE })

    act(() => lastTextInputProps('Name').onChangeText('Kid'))
    expect(lastChipProps().tag).toBe('K')

    act(() => swatchLabelled('Color 7').onPress())
    expect(lastChipProps().color).toBe(PALETTE_COLOR)
  })

  it("draws through ProfileColorProvider's preview when no colorPreview prop is passed, and lets the prop win", () => {
    const contextPreview = (hex: string) => `muted(${hex})`
    const propPreview = (hex: string) => `prop(${hex})`
    const props: EditProfileScreenProps = { profileId: NEW_PROFILE_ID, profiles: [], defaultColor: DEFAULT_COLOR, onCreate: jest.fn(), onSave: jest.fn(), onDelete: jest.fn(), onBack: jest.fn() }

    const { unmount } = render(
      <ProfileColorProvider preview={contextPreview}>
        <EditProfileScreen {...props} />
      </ProfileColorProvider>
    )
    expect(lastChipProps().color).toBe(`muted(${DEFAULT_COLOR})`)
    expect(flat(swatchLabelled('Color 7').style).backgroundColor).toBe(`muted(${PALETTE_COLOR})`)
    unmount()

    render(
      <ProfileColorProvider preview={contextPreview}>
        <EditProfileScreen {...props} colorPreview={propPreview} />
      </ProfileColorProvider>
    )
    expect(lastChipProps().color).toBe(`prop(${DEFAULT_COLOR})`)
    expect(flat(swatchLabelled('Color 7').style).backgroundColor).toBe(`prop(${PALETTE_COLOR})`)
  })
})

describe('EditProfileScreen: the color grid', () => {
  const onPalette = createProfile({ id: 'p', name: 'Pal', color: PALETTE_COLOR })

  it('offers the palette on the screen, the profile’s color picked', () => {
    renderScreen({ profileId: 'p', profiles: [onPalette] })

    expect(lastSwatches()).toHaveLength(20)
    expect(selectedSwatchLabels()).toEqual(['Color 7'])
  })

  it('rings the picked swatch in the text color (white on dark, black on light) and checks it', () => {
    renderScreen({ profileId: 'p', profiles: [onPalette] })

    const picked = swatchLabelled('Color 7')
    expect(flat(picked.style)).toMatchObject({ borderColor: '#000000', borderWidth: 3 })
    expect(picked.children.props.source).toBe('check')
    expect(flat(swatchLabelled('Color 8').style).borderWidth).toBeUndefined()
  })

  it('picking a swatch changes the color saved', () => {
    const al = createProfile({ id: 'a', name: 'Alice', color: '#000003', tag: 'AL' })
    const { onSave } = renderScreen({ profileId: 'a', profiles: [al] })

    act(() => swatchLabelled('Color 7').onPress())
    expect(selectedSwatchLabels()).toEqual(['Color 7'])
    act(() => lastButton('Done').onPress())

    expect(onSave).toHaveBeenCalledWith('a', { name: 'Alice', color: PALETTE_COLOR, tag: 'AL' })
  })

  // HexFleet's new profiles start on its Vanguard blue, which isn't one of auto-paper's colors.
  it('leads with a color off the palette, picked, so trying another can come back to it', () => {
    renderScreen()

    expect(lastSwatches()).toHaveLength(21)
    expect(lastSwatches()[0].accessibilityLabel).toBe('Current color')
    expect(selectedSwatchLabels()).toEqual(['Current color'])

    act(() => swatchLabelled('Color 7').onPress())
    expect(lastSwatches()[0].accessibilityLabel).toBe('Current color')
    act(() => swatchLabelled('Current color').onPress())
    expect(lastChipProps().color).toBe(DEFAULT_COLOR)
  })

  it("draws with ProfileColorProvider's renderSwatch as a color page, with no flat fill", () => {
    const renderSwatch = jest.fn((color: string) => `pie(${color})`)
    render(
      <ProfileColorProvider renderSwatch={renderSwatch}>
        <EditProfileScreen profileId='p' profiles={[onPalette]} defaultColor={DEFAULT_COLOR} onCreate={jest.fn()} onSave={jest.fn()} onDelete={jest.fn()} onBack={jest.fn()} />
      </ProfileColorProvider>
    )

    const size = flat(swatchLabelled('Color 8').style).width
    expect(renderSwatch).toHaveBeenCalledWith('#000008', size, 'colorPage')
    // The picked one is drawn inside its ring.
    expect(renderSwatch).toHaveBeenCalledWith(PALETTE_COLOR, size - 6, 'colorPage')
    expect(flat(swatchLabelled('Color 8').style).backgroundColor).toBeUndefined()
  })

  it('draws flat swatches without a renderer', () => {
    renderScreen()
    expect(flat(swatchLabelled('Color 8').style).backgroundColor).toBe('#000008')
  })

  it('lays out 21 colors (an off-palette default leading) as 3 rows of 7, on a phone and in a browser column', () => {
    renderScreen()
    const rowLengths = () => lastGrid().children.map((row: any) => row.props.children.length)

    // 402 wide less 40 of padding
    expect(rowLengths()).toEqual([7, 7, 7])
    act(() => lastGrid().onLayout({ nativeEvent: { layout: { width: EDIT_FORM_MAX_WIDTH, height: 200 } } }))
    expect(rowLengths()).toEqual([7, 7, 7])
    expect(flat(swatchLabelled('Color 8').style).width).toBe(SWATCH_MAX)
  })

  // Laid out for the swatches shown (Jay, 2026-11-20: the grid should come out even), so a profile on a
  // palette color, the usual case, fills every row.
  it('lays out a palette color profile as 4 rows of 5 on a phone and 2 rows of 10 in a browser column', () => {
    renderScreen({ profileId: 'p', profiles: [onPalette] })
    const rowLengths = () => lastGrid().children.map((row: any) => row.props.children.length)

    expect(rowLengths()).toEqual([5, 5, 5, 5])
    expect(flat(swatchLabelled('Color 8').style).width).toBe(SWATCH_MAX)
    // A zero width (a hidden frame) is ignored.
    act(() => lastGrid().onLayout({ nativeEvent: { layout: { width: 0, height: 0 } } }))
    expect(rowLengths()).toEqual([5, 5, 5, 5])
    act(() => lastGrid().onLayout({ nativeEvent: { layout: { width: EDIT_FORM_MAX_WIDTH, height: 200 } } }))
    expect(rowLengths()).toEqual([10, 10])
    expect(flat(swatchLabelled('Color 8').style).width).toBeCloseTo((EDIT_FORM_MAX_WIDTH - 9 * SWATCH_MIN_GAP) / 10)
  })
})

describe('EditProfileScreen: Delete Profile', () => {
  // hud's ConfirmDialog (Jay, 2026-10-15: one confirm card for the whole fleet), destructive, so its
  // header and Delete button take the danger role.
  it("opens hud's destructive confirmation naming the profile", () => {
    renderScreen({ profileId: 'a' })
    expect(lastConfirmProps().visible).toBe(false)
    act(() => lastButton('Delete Profile').onPress())

    expect(lastConfirmProps()).toMatchObject({ visible: true, title: 'Delete Profile?', icon: 'alert-outline', destructive: true, confirmLabel: 'Delete', cancelLabel: 'Cancel' })
    expect(lastConfirmProps().message).toBe('This permanently deletes Alice’s profile. This cannot be undone.')
  })

  it('cancelling leaves the profile untouched and the screen open', () => {
    const { onDelete, onBack } = renderScreen({ profileId: 'a' })
    act(() => lastButton('Delete Profile').onPress())
    act(() => lastConfirmProps().onCancel())

    expect(onDelete).not.toHaveBeenCalled()
    expect(onBack).not.toHaveBeenCalled()
    expect(lastConfirmProps().visible).toBe(false)
  })

  it('confirming deletes it and leaves, saving nothing, then or as the screen goes', () => {
    const { onDelete, onSave, onBack, rerender, props, unmount } = renderScreen({ profileId: 'a' })
    act(() => lastTextInputProps('Name').onChangeText('Alicia'))
    act(() => lastButton('Delete Profile').onPress())

    act(() => lastConfirmProps().onConfirm())
    // The roster without it, before the route unmounts the screen.
    rerender(<EditProfileScreen {...props} profiles={[]} />)
    unmount()

    expect(onDelete).toHaveBeenCalledWith('a')
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onDelete.mock.invocationCallOrder[0]).toBeLessThan(onBack.mock.invocationCallOrder[0])
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('EditProfile: the grid helpers', () => {
  const palette = [
    { label: 'Red', value: '#F44336' },
    { label: 'Blue', value: '#2196F3' }
  ]

  it('editSwatches leads with the start color only when it is off the palette, case-insensitively', () => {
    expect(editSwatches('#f44336', palette)).toEqual(palette)
    expect(editSwatches('#2563EB', palette)).toEqual([{ label: 'Current color', value: '#2563EB' }, ...palette])
  })

  it('gridColumns fills every row evenly where it can', () => {
    expect(gridColumns(335, 20)).toBe(5)
    expect(gridColumns(362, 20)).toBe(5)
    expect(gridColumns(440, 20)).toBe(10)
    expect(gridColumns(335, 21)).toBe(7)
    expect(gridColumns(EDIT_FORM_MAX_WIDTH, 20)).toBe(10)
  })

  it('gridColumns takes the most that fit when even rows would leave too few columns', () => {
    // 23 only divides by 1 and 23: 7 fit at 335
    expect(gridColumns(335, 23)).toBe(7)
    expect(gridColumns(335, 1)).toBe(1)
  })

  it('gridColumns never makes a swatch smaller than SWATCH_MIN', () => {
    for (const width of [200, 335, 402, 440, 480]) {
      for (const count of [20, 21]) {
        const columns = gridColumns(width, count)
        expect((width - SWATCH_MIN_GAP * (columns - 1)) / columns).toBeGreaterThanOrEqual(SWATCH_MIN)
      }
    }
  })

  it('gridLayout fills the row: swatches up to SWATCH_MAX, the rest shared out as space', () => {
    expect(gridLayout(335, 5)).toEqual({ size: SWATCH_MAX, gap: (335 - 5 * SWATCH_MAX) / 4 })
    expect(gridLayout(440, 10)).toEqual({ size: 35, gap: 10 })
    expect(gridLayout(100, 1)).toEqual({ size: SWATCH_MAX, gap: 0 })
    const { size, gap } = gridLayout(362, 5)
    expect(5 * size + 4 * gap).toBeCloseTo(362)
  })
})
