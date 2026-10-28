// Phase 305 (LOGX-02..04): ESLint config for the log-explorer plugin frontend.
//
// The plugin frontend is linted with the SAME minimal ruleset as `frontend/src`
// (react-hooks rules + no-unused-vars + no-undef + eqeqeq + react/jsx-uses-vars).
// The frontend config is imported by relative path so its lint packages resolve
// from `frontend/node_modules`; this plugin installs no lint dependency of its
// own (the light build installs nothing new at runtime).
//
// The plugin frontend has no local `eslint` binary, so run it from this
// directory using the resolved frontend binary:
//   npx eslint . --max-warnings 0
import frontendConfig from '../../../frontend/eslint.config.js'

// Reuse the frontend's application-source ruleset verbatim (same language
// options, plugins and rules) and widen its `files` to every plugin module.
const sourceEntry = frontendConfig.find(
  (entry) => Array.isArray(entry.files) && entry.files.includes('src/**/*.{js,jsx}'),
)

export default [
  { ignores: ['node_modules/', 'dist/'] },
  {
    ...sourceEntry,
    files: ['**/*.{js,jsx}'],
  },
]