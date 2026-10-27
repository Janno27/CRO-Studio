import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['node_modules/', 'dist/', 'captures/'] },
  js.configs.recommended,
  { languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-console': 'off', 'no-unused-vars': ['error', { caughtErrors: 'none' }] } },
];
