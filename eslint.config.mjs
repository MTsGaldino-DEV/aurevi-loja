import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/generated/**', 'apps/web/**', 'tools/**'] },
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
);
