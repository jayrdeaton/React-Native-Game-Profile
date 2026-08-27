const { defineConfig } = require('eslint/config')
const prettierRecommended = require('eslint-plugin-prettier/recommended')
const simpleImportSort = require('eslint-plugin-simple-import-sort')
const tsParser = require('@typescript-eslint/parser')
const eslintReactNative = require('eslint-plugin-react-native')
const reactHooks = require('eslint-plugin-react-hooks')
const tsEslint = require('typescript-eslint')
const packageJson = require('eslint-plugin-package-json')

module.exports = defineConfig([
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json'
      }
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', '.yalc/**', 'lib/**', 'coverage/**', '**/*.js', '**/*.mjs', '**/*.cjs', 'src/__mocks__/**', 'src/__tests__/**', '.claude/worktrees/**']
  },
  ...tsEslint.configs.recommended,
  prettierRecommended,
  packageJson.configs.recommended,
  {
    extends: [packageJson.configs.recommended],
    files: ['package.json'],
    rules: {
      'package-json/order-properties': 'warn',
      'package-json/sort-collections': 'warn'
    }
  },
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-native': eslintReactNative,
      'simple-import-sort': simpleImportSort
    },
    rules: {
      'prettier/prettier': 'warn',
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',
      'no-console': 'warn',
      'react-native/no-inline-styles': 'warn',
      'react-native/no-unused-styles': 'warn',
      'react-native/no-raw-text': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      // rules-of-hooks stays at error — it's the foundational hook-ordering check, not a judgment
      // call. exhaustive-deps and the four React-Compiler-era correctness rules below match
      // LightCycles' own severities (warn, not error) — see that project's eslint.config.cjs.
      // refs/set-state-in-effect are the two that caught real bugs in TriggerGauge/useAutoAlign
      // during this port: a ref read/written during the render body (safe only inside an effect,
      // since a discarded/replayed render can leave a ref mutated without ever committing), and a
      // setState call directly in a plain effect body (risks cascading renders) instead of via
      // React's "adjust state during render" pattern or a callback triggered by an external event.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn'
    }
  }
])
