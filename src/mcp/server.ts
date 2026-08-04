import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { config } from '../config.js';
import { apiKeyAuth } from './auth.js';
import { registerTools } from './tools/index.js';

const app = express();
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

app.listen(config.MCP_PORT, () => {
  console.log(`invoice-mcp listening on :${config.MCP_PORT} (POST /mcp)`);
});
