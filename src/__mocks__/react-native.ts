import React from 'react'

const noop = () => {}
const stub = ({ children }: { children?: React.ReactNode }) => children ?? null

// React Native's flatten: a style array (nested, with falsy entries) merged left to right into one
// object; nothing (or a falsy style) gives undefined. PickerMenu reads a host's triggerStyle through it.
const flatten = (style: unknown): Record<string, unknown> | undefined => {
  if (!style || typeof style !== 'object') return undefined
  if (!Array.isArray(style)) return style as Record<string, unknown>
  return style.reduce<Record<string, unknown>>((merged, part) => ({ ...merged, ...flatten(part) }), {})
}

const StyleSheet = {
  create: <T extends object>(styles: T): T => styles,
  flatten,
  absoluteFill: {},
  hairlineWidth: 1
}

const mockListener = { remove: noop }

const AppState = {
  addEventListener: jest.fn(() => mockListener),
  currentState: 'active' as 'active' | 'background' | 'inactive'
}

const Appearance = {
  getColorScheme: jest.fn(() => 'light' as 'light' | 'dark' | null),
  addChangeListener: jest.fn(() => mockListener)
}

const Platform = {
  OS: 'ios' as 'ios' | 'android' | 'web',
  select: <T extends Record<string, unknown>>(spec: T) => spec.ios ?? spec.default
}

export { AppState, Appearance, Platform, StyleSheet }
export const StatusBar = stub
export const View = jest.fn(stub)
export const ScrollView = jest.fn(stub)
export const Pressable = jest.fn(stub)
export const useWindowDimensions = jest.fn(() => ({ width: 402, height: 874, scale: 3, fontScale: 1 }))
