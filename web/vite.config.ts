import react from '@vitejs/plugin-react';
import { type Plugin, defineConfig, loadEnv } from 'vite';

/**
 * Where the app is served from. Absolute URLs in meta tags and in
 * robots/sitemap cannot be relative, and crawlers and link unfurlers do not run
 * our JavaScript, so the origin has to be baked in at build time.
 *
 * Overridden per environment with VITE_PUBLIC_ORIGIN. The default is the
 * current Railway host, so moving to a custom domain is one variable.
 */
const DEFAULT_ORIGIN = 'https://invoice-mcp-production-9bd0.up.railway.app';

/**
 * Substitutes the origin into index.html and emits robots.txt and sitemap.xml.
 *
 * They are generated rather than committed because both need an absolute URL —
 * `Sitemap:` and `<loc>` have no relative form — and a hard-coded host in a
 * checked-in static file is exactly what keeps pointing at the old domain for a
 * year after a move.
 *
 * Emitting them into the bundle puts them in `web/dist`, which `express.static`
 * serves ahead of the SPA fallback.
 */
function seoAssets(origin: string): Plugin {
  const routes = ['/', '/privacy', '/terms'];

  return {
    name: 'rayshio-seo-assets',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('%VITE_PUBLIC_ORIGIN%', origin),
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        // The private routes are noindex'd at runtime rather than disallowed
        // here: a Disallow stops the crawler fetching the page at all, so it
        // never sees the noindex, and the URL can still surface from a link.
        source: `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
      });

      const urls = routes.map((route) => `  <url><loc>${origin}${route}</loc></url>`).join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
    },
  };
}

/**
 * Loads React Scan, and only ever on the dev server.
 *
 * `apply: 'serve'` is what keeps it out of `web/dist`: the plugin does not run
 * during `vite build`, so `src/dev/react-scan.ts` is referenced by nothing the
 * bundler can see and is never emitted. An `import.meta.env.DEV` guard around a
 * static import would not do this — the import is hoisted out of the branch and
 * the whole library ships regardless.
 *
 * It is injected as its own module script rather than imported from `main.tsx`
 * because React Scan has to install the React DevTools hook before `react-dom`
 * evaluates. Module scripts run in document order, so `order: 'pre'` puts this
 * one ahead of the entry point; a dynamic import inside the entry would resolve
 * after React had already initialised and instrument nothing.
 */
function reactScanDev(): Plugin {
  return {
    name: 'rayshio-react-scan-dev',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'script',
          attrs: { type: 'module', src: '/src/dev/react-scan.ts' },
          injectTo: 'head-prepend' as const,
        },
      ],
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const origin = env.VITE_PUBLIC_ORIGIN ?? DEFAULT_ORIGIN;
  const port = Number(env.VITE_PORT ?? 5173);
  const apiPort = Number(env.VITE_API_PORT ?? 3000);

  return {
    plugins: [react(), seoAssets(origin), reactScanDev()],
    build: { outDir: 'dist', emptyOutDir: true },
    server: {
      port,
      // the API lives on the Express server; same-origin in production
      proxy: {
        '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true },
      },
    },
  };
});
