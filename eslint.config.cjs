const { defineConfig } = require('eslint/config')
const base = require('@infinitetoken/eslint-config/react-native')

module.exports = defineConfig([
  ...base,
  {
    ignores: ['.yalc/**', '**/*.cjs', 'src/__mocks__/**', 'src/__tests__/**', '.claude/worktrees/**']
  }
])
