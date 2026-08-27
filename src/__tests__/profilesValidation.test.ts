import { isValidProfile, isValidTag, MAX_PROFILE_NAME_LENGTH, MAX_TAG_LENGTH } from '../profilesValidation'

const VALID_PROFILE = {
  id: 'profile-1',
  name: 'Alice',
  color: '#2196f3',
  tag: '😎',
  createdAt: 1000,
  updatedAt: 1000
}

describe('isValidProfile', () => {
  it('accepts a fully valid profile', () => {
    expect(isValidProfile(VALID_PROFILE)).toBe(true)
  })

  it('rejects non-objects', () => {
    expect(isValidProfile(null)).toBe(false)
    expect(isValidProfile(undefined)).toBe(false)
    expect(isValidProfile('Alice')).toBe(false)
    expect(isValidProfile(42)).toBe(false)
  })

  it('rejects a missing or empty id', () => {
    const { id: _id, ...missingId } = VALID_PROFILE
    expect(isValidProfile(missingId)).toBe(false)
    expect(isValidProfile({ ...VALID_PROFILE, id: '' })).toBe(false)
  })

  it('rejects an empty or whitespace-only name', () => {
    expect(isValidProfile({ ...VALID_PROFILE, name: '' })).toBe(false)
    expect(isValidProfile({ ...VALID_PROFILE, name: '   ' })).toBe(false)
  })

  it('rejects a name longer than MAX_PROFILE_NAME_LENGTH', () => {
    expect(isValidProfile({ ...VALID_PROFILE, name: 'a'.repeat(MAX_PROFILE_NAME_LENGTH) })).toBe(true)
    expect(isValidProfile({ ...VALID_PROFILE, name: 'a'.repeat(MAX_PROFILE_NAME_LENGTH + 1) })).toBe(false)
  })

  it('rejects a non-hex color', () => {
    expect(isValidProfile({ ...VALID_PROFILE, color: 'blue' })).toBe(false)
    expect(isValidProfile({ ...VALID_PROFILE, color: '#fff' })).toBe(false)
  })

  it('accepts an uppercase hex color', () => {
    expect(isValidProfile({ ...VALID_PROFILE, color: '#2196F3' })).toBe(true)
  })

  it('rejects a missing tag, but accepts an empty one', () => {
    const { tag: _tag, ...missingTag } = VALID_PROFILE
    expect(isValidProfile(missingTag)).toBe(false)
    expect(isValidProfile({ ...VALID_PROFILE, tag: '' })).toBe(true)
  })

  it('rejects non-numeric createdAt/updatedAt', () => {
    expect(isValidProfile({ ...VALID_PROFILE, createdAt: '1000' })).toBe(false)
    expect(isValidProfile({ ...VALID_PROFILE, updatedAt: '1000' })).toBe(false)
  })

  it('ignores app-specific extra fields — structural typing lets a richer Profile through', () => {
    expect(isValidProfile({ ...VALID_PROFILE, keyScheme: 'wasd' })).toBe(true)
  })
})

describe('isValidTag', () => {
  it('accepts an empty tag — no tag set yet', () => {
    expect(isValidTag('')).toBe(true)
  })

  it('accepts a single emoji, including a multi-codepoint one', () => {
    expect(isValidTag('😎')).toBe(true)
    expect(isValidTag('🇺🇸')).toBe(true) // flag: a regional-indicator pair
    expect(isValidTag('👨‍👩‍👧')).toBe(true) // ZWJ-joined family
  })

  it('accepts up to MAX_TAG_LENGTH plain letters', () => {
    expect(isValidTag('J')).toBe(true)
    expect(isValidTag('JAY')).toBe(true)
    expect(isValidTag('J'.repeat(MAX_TAG_LENGTH))).toBe(true)
  })

  it('rejects more than MAX_TAG_LENGTH plain letters', () => {
    expect(isValidTag('J'.repeat(MAX_TAG_LENGTH + 1))).toBe(false)
  })

  it('rejects mixing an emoji with letters', () => {
    expect(isValidTag('😎J')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isValidTag(5)).toBe(false)
    expect(isValidTag(null)).toBe(false)
    expect(isValidTag(undefined)).toBe(false)
  })
})
