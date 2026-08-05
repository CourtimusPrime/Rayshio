import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toNodeHandler } from 'better-auth/node';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { publicRouter } from '../api/public-routes.js';
import { BadRequest, apiRouter } from '../api/routes.js';
import { requireSameOrigin } from '../auth/context.js';
import { auth } from '../auth/index.js';
import { config } from '../config.js';
import { apiKeyAuth, orgForRequest } from './auth.js';
import { registerTools } from './tools/index.js';

const app = express();

/*
 * Railway terminates TLS at its edge, so without this every request appears to
 * come from the proxy: req.ip is one address for the whole internet, which
 * collapses any per-IP throttle into a single global bucket, and req.protocol
 * reads 'http' behind an https listener.
 */
app.set('trust proxy', 1);
app.disable('x-powered-by');

/*
 * Above everything, including the static SPA, so X-Frame-Options and nosniff
 * cover the dashboard shell too. CSP is off: the SPA's pre-paint theme resolver
 * is an inline script, and a policy that permits it via unsafe-inline is not
 * worth the line it costs.
 */
app.use(helmet({ contentSecurityPolicy: false }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

/*
 * Before express.json(), and that order is load-bearing: Better Auth reads the
 * raw request body itself, and a body parser that has already consumed the
 * stream leaves its client hanging on a request that never resolves.
 *
 * '/api/auth/*splat', not '/api/auth/*' — the bare star is Express 4 syntax and
 * matches nothing under Express 5.
 */
app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json({ limit: '4mb' }));

// SameSite=Lax already blocks the classic cross-site post; this covers the rest
// of /api. It deliberately does not cover POST /mcp — see requireSameOrigin.
app.use('/api', requireSameOrigin);

// stateless: one transient server+transport per request — safe behind a load balancer
app.post('/mcp', apiKeyAuth, (req, res) => {
  void (async () => {
    // the org comes from the key that authenticated the call, never from its body
    const server = new McpServer({ name: 'invoice-mcp', version: '0.1.0' });
    registerTools(server, orgForRequest(req));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  })().catch((err) => {
    console.error('mcp request failed:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'internal error' },
        id: null,
      });
    }
  });
});

// stateless server: no session streams to resume/delete
app.get('/mcp', (_req, res) => {
  res.status(405).set('Allow', 'POST').send();
});
app.delete('/mcp', (_req, res) => {
  res.status(405).set('Allow', 'POST').send();
});

// the only ungated router; everything in apiRouter() sits behind requireAuth
app.use('/api', publicRouter());
app.use('/api', apiRouter());

// JSON errors for /api; anything unexpected is logged and reported as a 500
app.use('/api', (err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof BadRequest) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error('api request failed:', err);
  res.status(500).json({ error: 'internal error' });
});

// Built SPA, when present. dist/mcp/server.js → ../../../web/dist
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(webDist)) {
  // ahead of the SPA fallback, so robots.txt, sitemap.xml and og.png are served
  // as themselves rather than as the app shell
  app.use(express.static(webDist));
  // client-side routing: every non-API GET falls back to the shell
  app.get(/^\/(?!api\/|mcp$|healthz$).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
} else {
  console.log(`no built dashboard at ${webDist} — run 'pnpm --filter web build' to serve it`);
}

// Railway injects PORT; MCP_PORT is the local-dev fallback
const port = Number(process.env.PORT ?? config.MCP_PORT);
app.listen(port, () => {
  console.log(`invoice-mcp listening on :${port} (POST /mcp, GET /api, dashboard at /)`);
});
