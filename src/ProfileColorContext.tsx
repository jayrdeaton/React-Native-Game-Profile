import { createContext, type ReactNode, useContext } from 'react'

const ProfileColorContext = createContext<((hex: string) => string) | undefined>(undefined)

interface ProfileColorProviderProps {
  // Maps a profile's saved color to the color actually drawn for it. Solitaire blends profile colors
  // toward its card-back palette so they read muted, not as the raw swatch; a context rather than a
  // module-level setting because that blend depends on light/dark mode.
  preview: (hex: string) => string
  children: ReactNode
}

// App-wide display transform for profile colors. Every ProfileChip, ProfilePicker's selected-row
// fill and ProfilesManager's color picker previews read it, and so does anything outside this
// package that draws a ProfileChip (@tastic/hud's AchievementUnlockList). Without a provider,
// profile colors draw as saved.
export function ProfileColorProvider({ preview, children }: ProfileColorProviderProps) {
  return <ProfileColorContext.Provider value={preview}>{children}</ProfileColorContext.Provider>
}

// The provider's preview, or undefined when there's none (so a caller can tell "no transform"
// apart from an identity one, e.g. to fall back to its own colorPreview prop).
export function useProfileColorPreview(): ((hex: string) => string) | undefined {
  return useContext(ProfileColorContext)
}

// Resolves one saved color to its drawn color.
export function useProfileDisplayColor(hex: string): string {
  const preview = useProfileColorPreview()
  return preview ? preview(hex) : hex
}
