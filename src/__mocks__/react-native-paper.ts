import React from 'react'

export const Icon = jest.fn(() => null)

export const IconButton = jest.fn(() => null)

export const Text = jest.fn(({ children }: { children?: React.ReactNode }) => children ?? null)
