import { render } from '@testing-library/react'
import { View } from 'react-native'
import { Icon, Text } from 'react-native-paper'

import { Profile } from '../types'

jest.mock('@rific/auto-paper', () => ({
  getContrastColor: jest.fn((color: string) => (color === '#000000' ? '#ffffff' : '#000000'))
}))

import { getContrastColor } from '@rific/auto-paper'

import { ProfileChip } from '../ProfileChip'

const mockView = View as unknown as jest.Mock
const mockIcon = Icon as jest.MockedFunction<typeof Icon>
const mockText = Text as jest.MockedFunction<typeof Text>
const mockGetContrastColor = getContrastColor as jest.MockedFunction<typeof getContrastColor>

const PROFILE: Profile = {
  id: 'profile-1',
  name: 'Alice',
  color: '#000000',
  tag: '',
  createdAt: 1000,
  updatedAt: 1000
}

function chipStyle() {
  return mockView.mock.calls[0][0].style as Record<string, unknown>[]
}

function textStyle() {
  return mockText.mock.calls[0][0].style as Record<string, unknown>[]
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('ProfileChip', () => {
  it('renders the tag text and not the fallback icon when profile.tag is set', () => {
    render(<ProfileChip profile={{ ...PROFILE, tag: 'J' }} />)
    expect(mockText).toHaveBeenCalledTimes(1)
    expect(mockText.mock.calls[0][0].children).toBe('J')
    expect(mockIcon).not.toHaveBeenCalled()
  })

  it('falls back to the account icon and not the tag text when profile.tag is empty', () => {
    render(<ProfileChip profile={{ ...PROFILE, tag: '' }} />)
    expect(mockIcon).toHaveBeenCalledTimes(1)
    expect(mockText).not.toHaveBeenCalled()
    expect(mockIcon.mock.calls[0][0].source).toBe('account')
  })

  it('sizes the fallback icon at 0.6 of the given size', () => {
    render(<ProfileChip profile={{ ...PROFILE, tag: '' }} size={30} />)
    expect(mockIcon.mock.calls[0][0].size).toBe(18)
  })

  it('fills the chip with the profile color when filled is true (the default)', () => {
    render(<ProfileChip profile={{ ...PROFILE, color: '#2196f3' }} />)
    expect(chipStyle()).toContainEqual({ backgroundColor: '#2196f3' })
  })

  it('leaves the chip unfilled when filled is false, while keeping the same footprint', () => {
    render(<ProfileChip profile={{ ...PROFILE, color: '#2196f3' }} filled={false} size={22} />)
    const style = chipStyle()
    expect(style).not.toContainEqual({ backgroundColor: '#2196f3' })
    // the `filled && {...}` expression short-circuits to `false`, which React silently ignores
    // as a style array entry — the circle keeps its size/shape either way
    expect(style[style.length - 1]).toBe(false)
    expect(style).toContainEqual({ borderRadius: 11, height: 22, width: 22 })
  })

  it('sizes the chip circle from the size prop, defaulting to 22', () => {
    render(<ProfileChip profile={PROFILE} />)
    expect(chipStyle()).toContainEqual({ borderRadius: 11, height: 22, width: 22 })
  })

  it('honors a custom size prop for the chip circle', () => {
    render(<ProfileChip profile={PROFILE} size={40} />)
    expect(chipStyle()).toContainEqual({ borderRadius: 20, height: 40, width: 40 })
  })

  it('sizes a plain-text tag at a 0.4 font-size ratio', () => {
    render(<ProfileChip profile={{ ...PROFILE, tag: 'J' }} size={20} />)
    expect(textStyle()).toContainEqual(expect.objectContaining({ fontSize: 8 }))
  })

  it('sizes an emoji tag at a larger 0.6 font-size ratio than plain text gets at the same size', () => {
    render(<ProfileChip profile={{ ...PROFILE, tag: '🎮' }} size={20} />)
    expect(textStyle()).toContainEqual(expect.objectContaining({ fontSize: 12 }))
  })

  it('treats a ZWJ-joined compound emoji as an emoji, not plain text, for the font-size ratio', () => {
    render(<ProfileChip profile={{ ...PROFILE, tag: '👨‍👩‍👧' }} size={20} />)
    expect(textStyle()).toContainEqual(expect.objectContaining({ fontSize: 12 }))
  })

  it('passes numberOfLines and adjustsFontSizeToFit so a long tag shrinks instead of wrapping', () => {
    render(<ProfileChip profile={{ ...PROFILE, tag: 'JAY' }} />)
    const call = mockText.mock.calls[0][0]
    expect(call.numberOfLines).toBe(1)
    expect(call.adjustsFontSizeToFit).toBe(true)
  })

  it('derives contrast color from profile.color and applies it to the tag text', () => {
    render(<ProfileChip profile={{ ...PROFILE, tag: 'J', color: '#000000' }} />)
    expect(mockGetContrastColor).toHaveBeenCalledWith('#000000')
    expect(textStyle()).toContainEqual(expect.objectContaining({ color: '#ffffff' }))
  })

  it('derives contrast color from profile.color and applies it to the fallback icon', () => {
    render(<ProfileChip profile={{ ...PROFILE, tag: '', color: '#ffffff' }} />)
    expect(mockGetContrastColor).toHaveBeenCalledWith('#ffffff')
    expect(mockIcon.mock.calls[0][0].color).toBe('#000000')
  })
})
