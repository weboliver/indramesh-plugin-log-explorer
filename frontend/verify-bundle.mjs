#!/usr/bin/env node
/**
 * Build-output inspection for the log-explorer registration bundle
 * (Phase 305, LOGX-02..04; Phase-303 SEAM-06 model, simplified from
 * plugins/graphql-studio/frontend/verify-bundle.mjs — there is no heavy
 * payload in this plugin).
 *
 * Fails the build unless `plugins/log-explorer/static/log-explorer.js` is a
 * single self-contained ES file that:
 *   * imports ONLY the host singletons, externalized by identity;
 *   * makes no blob-relative sibling chunk/CSS/worker/font request;
 *   * has a default export; and
 * while no separate CSS asset is emitted next to it (the explorer styles ship
 * as JS strings through the host `injectPluginStyles`).
 *
 * The detector is self-tested at startup: it must flag a synthetic non-host
 * import and a synthetic relative dynamic import, and must NOT flag a host-only
 * module. A regression in the detector therefore fails the build too.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const HERE = import.meta.dirname
const STATIC_DIR = path.resolve(HERE, '..', 'static')
const BUNDLE_FILE = path.join(STATIC_DIR, 'log-explorer.js')

// The exact host singleton allow-list (frontend/index.html import map). Keep in
// sync with vite.config.mjs.
export const HOST_SINGLETONS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'react-router',
  'react-router-dom',
  '@tanstack/react-query',
  '@indramesh/plugin-api',
]
const HOST_SET = new Set(HOST_SINGLETONS)

// Static `import ... from`, bare `import "..."`, `export ... from`, and literal
// dynamic `import("...")` specifiers. Line/quote anchoring keeps library strings
// that merely contain the word "from" from being treated as imports.
const IMPORT_SPECIFIER_PATTERNS = [
  /^[ \t]*import\s+[^;\n]*?\bfrom\s+["']([^"']+)["']/gm,
  /^[ \t]*import\s+["']([^"']+)["']/gm,
  /^[ \t]*export\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+["']([^"']+)["']/gm,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
]

// A default export must survive the build.
const DEFAULT_EXPORT_RE = /\bas\s+default\b/

const VIOLATION_PATTERNS = [
  { label: 'external font/image URL', re: /url\(\s*["']?(?:\.\.?\/)[^)"']*["']?\s*\)/g },
  { label: 'external font/image URL', re: /url\(\s*["']?\/[^)"']*["']?\s*\)/g },
  { label: 'external font/image URL', re: /url\(\s*["']?https?:[^)"']*["']?\s*\)/g },
  { label: 'CSS @import', re: /@import\b/g },
  { label: 'blob-relative sibling resolution', re: /import\s*\(\s*["']\.\.?\//g },
  { label: 'blob-relative sibling resolution', re: /import\.meta\.url/g },
  { label: 'blob-relative sibling resolution', re: /new\s+URL\s*\(\s*["']\.\.?\//g },
  { label: 'external worker URL', re: /new\s+Worker\s*\(\s*["'](?!data:|blob:)[^"']*["']/g },
  // The host `api` axios instance already carries `baseURL: '/api/v1/'`. An
  // absolute '/api/v1/plugins/...' call path doubles the prefix at runtime
  // ('/api/v1/api/v1/...' -> 404); the plugin API path must be relative to the
  // host baseURL. Found by the Phase 305 plan-end E2E (2026-10-09).
  { label: 'absolute plugin API path (host api baseURL already prefixes /api/v1)', re: /["'`]\/api\/v1\/plugins\//g },
]

/**
 * Returns the list of contract violations found in a bundle source string.
 * Exported so the detector can be exercised directly.
 */
export function findViolations(code) {
  const violations = []
  for (const re of IMPORT_SPECIFIER_PATTERNS) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(code)) !== null) {
      if (!HOST_SET.has(match[1])) {
        violations.push(`non-host runtime import: ${match[1]}`)
      }
    }
  }
  for (const { label, re } of VIOLATION_PATTERNS) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(code)) !== null) {
      violations.push(`${label}: ${match[0].slice(0, 80)}`)
    }
  }
  return violations
}

function assertDetector() {
  const nonHost = 'import evil from "left-pad";\nexport default evil;\n'
  if (!findViolations(nonHost).some((v) => v.includes('left-pad'))) {
    throw new Error('detector self-test: a non-host import was NOT detected')
  }
  const relative = 'const lazy = () => import("./sibling-chunk.js");\n'
  if (!findViolations(relative).some((v) => v.includes('sibling-chunk'))) {
    throw new Error('detector self-test: a relative dynamic import was NOT detected')
  }
  const hostOnly = 'import { useState } from "react";\nexport default useState;\n'
  const falsePositives = findViolations(hostOnly)
  if (falsePositives.length > 0) {
    throw new Error(`detector self-test: false positive on a host import: ${falsePositives.join('; ')}`)
  }
  const absoluteApi = 'const u = "/api/v1/plugins/log-explorer/status";\n'
  if (!findViolations(absoluteApi).some((v) => v.includes('absolute plugin API path'))) {
    throw new Error('detector self-test: an absolute /api/v1 plugin API path was NOT detected')
  }
}

function main() {
  const problems = []
  try {
    assertDetector()
  } catch (error) {
    console.error('verify-bundle: FAILED')
    console.error(` - ${error.message}`)
    process.exit(1)
  }

  if (!existsSync(BUNDLE_FILE)) problems.push(`missing bundle output: ${BUNDLE_FILE}`)

  if (existsSync(STATIC_DIR)) {
    const cssFiles = readdirSync(STATIC_DIR).filter((name) => name.endsWith('.css'))
    if (cssFiles.length > 0) problems.push(`separate CSS asset(s) emitted: ${cssFiles.join(', ')}`)
  }

  if (existsSync(BUNDLE_FILE)) {
    const code = readFileSync(BUNDLE_FILE, 'utf8')
    problems.push(...findViolations(code).map((violation) => `registration bundle: ${violation}`))
    if (!DEFAULT_EXPORT_RE.test(code)) problems.push('registration bundle has no default export')
  }

  if (problems.length > 0) {
    console.error('verify-bundle: FAILED')
    for (const problem of problems) console.error(` - ${problem}`)
    process.exit(1)
  }

  console.log(
    'verify-bundle: OK — single self-contained registration bundle (host-only imports, no sibling or CSS assets)',
  )
}

// Run only when invoked directly (`node verify-bundle.mjs`), so the detector
// can be imported and unit-exercised without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}