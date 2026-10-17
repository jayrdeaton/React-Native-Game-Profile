import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

// This package takes everything it needs from @tastic/hud through hud's light './chrome' entry (hud
// 0.23.0+). hud's main entry also re-exports the per-seat lobby, AchievementUnlockList and the Skia
// gauge, so a single import from it would make every app that uses this package need Skia and
// @tastic/split-screen (Hangman has neither). eslint.config.cjs bans the bare specifier in import
// statements; this also covers jest.mock(), require() and import(), and any other hud subpath, by
// checking every quoted '@tastic/hud...' string under src/ (comments name hud without quotes).

const SRC = join(__dirname, '..')
const HUD_SPECIFIER = /(['"`])(@tastic\/hud(?:\/[^'"`]*)?)\1/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    // This file names the bare specifier itself, in the pattern above.
    return /\.tsx?$/.test(name) && path !== __filename ? [path] : []
  })
}

describe('@tastic/hud import boundary', () => {
  const found = sourceFiles(SRC).flatMap((file) => [...readFileSync(file, 'utf8').matchAll(HUD_SPECIFIER)].map((match) => ({ file: relative(SRC, file), specifier: match[2] })))

  it('sees the hud imports it guards, in source and in the test mocks', () => {
    expect(found.map(({ file }) => file)).toEqual(expect.arrayContaining(['OptionPicker.tsx', 'PickerMenu.tsx', 'ProfilePicker.tsx', 'ProfilesManager.tsx', join('__tests__', 'OptionPicker.test.tsx'), join('__tests__', 'ProfilePicker.test.tsx'), join('__tests__', 'ProfilesManager.test.tsx')]))
  })

  it("names only '@tastic/hud/chrome'", () => {
    expect(found.filter(({ specifier }) => specifier !== '@tastic/hud/chrome')).toEqual([])
  })
})
