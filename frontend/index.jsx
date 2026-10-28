// Phase 305 (LOGX-02..04): the log-explorer registration bundle entry.
//
// The default export declares the plugin's host contributions exactly as the
// frozen contract expects: plugin-scoped `translations`, the explorer `pages`
// entry (`/plugins/log-explorer/explorer`, D-16), the Administration `navItems`
// entry and the `taskDetailActions` entry (LOGX-04). Every host singleton is
// imported from `@indramesh/plugin-api` (externalized by identity at build), so
// the bundle shares the host's one React/Router/Query instance.
//
// No production warning banner (Carry-03): log-explorer is a normal supported
// feature and is active by default.
import en from './locales/en.json'
import de from './locales/de.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import pt from './locales/pt.json'
import ExplorerPage from './explorer-page.jsx'
import TaskLogAction from './task-log-action.jsx'

export default {
  // FEEXT-04: the plugin ships its own per-language JSON; the host installs it
  // under the plugin-assigned namespace (never core `systemui`).
  translations: { en, de, es, fr, pt },
  pages: [
    {
      id: 'log-explorer-page',
      // Served at `/plugins/log-explorer/explorer`; the Core route
      // `/administration/system-logs` redirects here when the plugin is active.
      path: 'explorer',
      component: ExplorerPage,
    },
  ],
  navItems: [
    {
      id: 'log-explorer-nav',
      label: 'System logs',
      labelKey: 'nav.label',
      path: '/plugins/log-explorer/explorer',
      icon: 'scroll-text',
      group: 'Administration',
      // The plugin-owned business permission (ownership transferred from Core in
      // 305-01); the host `plugin-runtime:use` gate applies on top.
      permission: 'system-logs:read',
    },
  ],
  taskDetailActions: [
    {
      id: 'log-explorer-task-action',
      label: 'Open system logs',
      labelKey: 'task.action',
      permission: 'system-logs:read',
      component: TaskLogAction,
    },
  ],
}