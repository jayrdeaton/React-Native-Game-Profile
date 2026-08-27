import React from 'react'

const noop = () => {}
const stub = ({ children }: { children?: React.ReactNode }) => children ?? null

const StyleSheet = {
  create: <T extends object>(styles: T): T => styles,
  flatten: (style: unknown) => style,
  absoluteFill: {},
  hairlineWidth: 1
}

const mockListener = { remove: noop }

const Appearance = {
  getColorScheme: jest.fn(() => 'light' as 'light' | 'dark' | null),
  addChangeListener: jest.fn(() => mockListener)
}

const Platform = {
  OS: 'ios' as 'ios' | 'android' | 'web',
  select: <T extends Record<string, unknown>>(spec: T) => spec.ios ?? spec.default
}

export { Appearance, Platform, StyleSheet }
export const StatusBar = stub
export const View = jest.fn(stub)
export const ScrollView = jest.fn(stub)
export const Pressable = jest.fn(stub)
export const useWindowDimensions = jest.fn(() => ({ width: 402, height: 874, scale: 3, fontScale: 1 }))
