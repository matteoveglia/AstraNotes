/** @type {import('eslint').Linter.FlatConfig} */
const js = require('@eslint/js');
const globals = require('globals');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  // Include ESLint's recommended settings
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['node_modules/**', 'dist/**', 'private/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
        NodeJS: true
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'no-prototype-builtins': 'off'
    }
  },
  {
    files: ['dist/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node
      }
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-prototype-builtins': 'off'
    }
  },
  {
    files: ['*.js', '*.cjs'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
]
