// Plugin-local REGISTRATION build (Phase 305, LOGX-02..04; Phase-303 D-13/D-14
// model, mirroring plugins/graphql-studio/frontend/vite.config.mjs).
//
// Produces `plugins/log-explorer/static/log-explorer.js`: a single ES file that
// registers the plugin's explorer page, its Administration nav item and the
// task-detail action. Every host singleton is externalized BY IDENTITY so the
// bundle shares the host's one React, Router, QueryClient and authenticated api
// client (the import map in frontend/index.html resolves those bare specifiers
// at runtime).
//
// log-explorer needs only this light registration bundle: the histogram is
// plain DOM + one scoped stylesheet (injected through the host
// `injectPluginStyles`), never a chart library, and there is no heavy payload.
export default {
  root: import.meta.dirname,
  build: {
    lib: {
      entry: 'index.jsx',
      formats: ['es'],
      fileName: () => 'log-explorer.js',
    },
    outDir: '../static',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        'react-dom',
        'react-dom/client',
        'react-router',
        'react-router-dom',
        '@tanstack/react-query',
        '@indramesh/plugin-api',
      ],
    },
  },
}