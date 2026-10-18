import { createContext, type ReactNode, useContext, useMemo } from 'react'

// Where a swatch is drawn: an IdentityChip (ProfileChip, the pickers' chip trigger), a picker's Color
// row, or a swatch on its color page. An app can tell an identity (a chip, which wants a legible mark
// on one color) from a choice of color (the Color row and page, where previewing more of what the
// color gives is the point): Hangman draws its triad pie only on the latter.
export type ProfileSwatchPlace = 'chip' | 'colorRow' | 'colorPage'

// Draws one color's swatch fill: a circle `size` across, standing in for the flat fill, at `place`.
// `color` is the drawn color (after `preview`), and it stays the primary one: the tag, icon, check or
// dot on top of the swatch takes its contrast from it. Returning null or undefined keeps that swatch's
// flat fill.
export type ProfileSwatchRenderer = (color: string, size: number, place: ProfileSwatchPlace) => ReactNode

interface ProfileColorContextValue {
  preview?: (hex: string) => string
  renderSwatch?: ProfileSwatchRenderer
}

const ProfileColorContext = createContext<ProfileColorContextValue>({})

interface ProfileColorProviderProps {
  // Maps a profile's saved color to the color actually drawn for it. Solitaire blends profile colors
  // toward its card-back palette so they read muted, not as the raw swatch; a context rather than a
  // module-level setting because that blend depends on light/dark mode.
  preview?: (hex: string) => string
  // Replaces the flat fill of the round swatches this package draws: IdentityChip (ProfileChip and the
  // pickers' chip trigger), the pickers' Color row swatch and their color page swatches, each told
  // where it is (ProfileSwatchPlace) and kept flat where it returns null. Hangman draws a pie of each
  // color's triad on the Color row and page only. The renderer is drawn behind the swatch's mark,
  // clipped to the circle.
  // Rows that fill with a color (a selected picker row) stay flat, and so does hud's InlineColorPicker
  // (ProfilesManager's color trigger and swatches), which doesn't read this context.
  renderSwatch?: ProfileSwatchRenderer
  children: ReactNode
}

// App-wide display transform for profile colors. Every ProfileChip, ProfilePicker's selected-row
// fill and ProfilesManager's color picker previews read it, and so does anything outside this
// package that draws a ProfileChip (@tastic/hud's AchievementUnlockList). Without a provider (or
// with neither prop), profile colors draw as saved, in flat swatches.
export function ProfileColorProvider({ preview, renderSwatch, children }: ProfileColorProviderProps) {
  const value = useMemo(() => ({ preview, renderSwatch }), [preview, renderSwatch])
  return <ProfileColorContext.Provider value={value}>{children}</ProfileColorContext.Provider>
}

// The provider's preview, or undefined when there's none (so a caller can tell "no transform"
// apart from an identity one, e.g. to fall back to its own colorPreview prop).
export function useProfileColorPreview(): ((hex: string) => string) | undefined {
  return useContext(ProfileColorContext).preview
}

// The provider's swatch renderer, or undefined for the flat fill.
export function useProfileSwatchRenderer(): ProfileSwatchRenderer | undefined {
  return useContext(ProfileColorContext).renderSwatch
}

// Resolves one saved color to its drawn color.
export function useProfileDisplayColor(hex: string): string {
  const preview = useProfileColorPreview()
  return preview ? preview(hex) : hex
}
