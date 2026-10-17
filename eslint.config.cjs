const { defineConfig } = require('eslint/config')
const base = require('@infinitetoken/eslint-config/react-native')

module.exports = defineConfig([
  ...base,
  {
    // src/__mocks__/** stays ignored: tsconfig.json's own `exclude` drops src/__mocks__,
    // so the type-aware parser can't find those files in-project and errors if linted here.
    ignores: ['src/__mocks__/**']
  },
  // @tastic/hud's main entry also re-exports the per-seat lobby, AchievementUnlockList (which imports
  // this package) and the Skia gauge, so one import from it would make every app that uses this
  // package need Skia and @tastic/split-screen, Hangman included. Everything this package needs is in
  // the light './chrome' entry (hud 0.23.0+). src/__tests__/hudImports.test.ts also covers jest.mock()
  // and require(), which this rule doesn't see.
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@tastic/hud',
              message: "Import from '@tastic/hud/chrome' instead. The main entry pulls in Skia and @tastic/split-screen."
            }
          ]
        }
      ]
    }
  }
])
