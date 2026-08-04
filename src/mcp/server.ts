import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import { BadRequest, apiRouter } from '../api/routes.js';
import { config } from '../config.js';
import { apiKeyAuth } from './auth.js';
import { registerTools } from './tools/index.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// stateless: one transient server+transport per request — safe behind a load balancer
app.post('/mcp', apiKeyAuth, (req, res) => {
  void (async () => {
    const server = new McpServer({ name: 'invoice-mcp', version: '0.1.0' });
    registerTools(server);
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
