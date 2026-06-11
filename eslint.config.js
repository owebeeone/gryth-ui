import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

// gryth-ui: no React local state — use grips/taps instead (see dev-docs/CodingRules.md).
// Approved exceptions carry an /* Approved: <hook>: Approval ID <n> */ marker
// (registry in scripts/no-react-state.test.mjs) plus an eslint-disable-next-line.
const BANNED_HOOKS = ['useState', 'useEffect', 'useRef', 'useReducer', 'useMemo', 'useCallback', 'useLayoutEffect']
const bannedHookRules = BANNED_HOOKS.flatMap((hook) => [
  { selector: `CallExpression[callee.name='${hook}']`, message: `${hook} is banned — model state with grips/taps (see dev-docs/CodingRules.md).` },
  { selector: `ImportSpecifier[imported.name='${hook}']`, message: `Do not import ${hook} — model state with grips/taps (see dev-docs/CodingRules.md).` },
])

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'no-restricted-syntax': ['error', ...bannedHookRules],
    },
  },
])
