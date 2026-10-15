import { avoidSeatColorClash } from '../seatColorClash'

const DEFAULTS = ['#2E7D32', '#FBC02D'] as const

describe('avoidSeatColorClash', () => {
  it("keeps seat 2's color when it differs from seat 1's", () => {
    expect(avoidSeatColorClash('#2196f3', '#e91e63', DEFAULTS)).toBe('#e91e63')
  })

  it("moves seat 2 to seat 1's default when both land on the same color", () => {
    expect(avoidSeatColorClash('#2196f3', '#2196f3', DEFAULTS)).toBe('#2E7D32')
  })

  it("moves seat 2 to seat 2's default when both are on seat 1's default", () => {
    expect(avoidSeatColorClash('#2E7D32', '#2E7D32', DEFAULTS)).toBe('#FBC02D')
  })

  it("moves seat 2 to seat 1's default when both are on seat 2's default", () => {
    expect(avoidSeatColorClash('#FBC02D', '#FBC02D', DEFAULTS)).toBe('#2E7D32')
  })

  it('treats colors that differ only in case as the same color', () => {
    expect(avoidSeatColorClash('#2196F3', '#2196f3', DEFAULTS)).toBe('#2E7D32')
    expect(avoidSeatColorClash('#2e7d32', '#2E7D32', DEFAULTS)).toBe('#FBC02D')
  })

  it("never leaves seat 2 on seat 1's color", () => {
    for (const color of ['#2196f3', '#2E7D32', '#FBC02D', '#2e7d32']) {
      expect(avoidSeatColorClash(color, color, DEFAULTS).toLowerCase()).not.toBe(color.toLowerCase())
    }
  })
})
