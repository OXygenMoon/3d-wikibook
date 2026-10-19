import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', '.local-data/**', '.tmp/**', 'test-results/**', 'backups/**', 'drizzle/**', 'playwright-report/**'],
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-undef': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-debugger': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-unused-vars': 'off',
    },
  },
];
