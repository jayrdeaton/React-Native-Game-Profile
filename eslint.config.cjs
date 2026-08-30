const { defineConfig } = require('eslint/config')
const base = require('@infinitetoken/eslint-config/react-native')

module.exports = defineConfig([
  ...base,
  {
    // src/__mocks__/** stays ignored: tsconfig.json's own `exclude` drops src/__mocks__,
    // so the type-aware parser can't find those files in-project and errors if linted here.
    ignores: ['src/__mocks__/**']
  }
])
