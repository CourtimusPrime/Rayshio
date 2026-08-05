import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { useWorkspace } from '../state/workspace';
import { LoadingBlock } from './states';

/** The five tools this server actually registers (src/mcp/tools/index.ts). */
const mcpTools = [
  { name: 'list_services', description: 'Vendors you have invoices from, with counts and date range' },
  { name: 'list_invoices', description: 'Invoices, filterable by service name and date range' },
  { name: 'get_invoice', description: 'One invoice in full, including its line items' },
  { name: 'get_invoice_pdf', description: 'The original PDF for an invoice, when one was attached' },
  { name: 'spend_summary', description: 'Totals grouped by service or line-item description, per currency' },
];

const TOKEN_PLACEHOLDER = '<MCP_API_KEY>';

interface McpClient {
  id: string;
  name: string;
  subtitle: string;
  configLabel: string;
  snippet: (endpoint: string) => string;
  hint: string;
}

/**
 * These are the real connection recipes for this server: Streamable HTTP with a
 * Bearer API key. Clients whose connector UI assumes OAuth go through the
 * mcp-remote bridge instead.
 */
const mcpClients: McpClient[] = [
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    subtitle: 'claude_desktop_config.json',
    configLabel: 'Config file',
    snippet: (endpoint) => `{
  "mcpServers": {
    "invoice-mcp": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "${endpoint}",
        "--header", "Authorization: Bearer ${TOKEN_PLACEHOLDER}"
      ]
    }
  }
}`,
    hint: "Claude Desktop's connector UI expects OAuth, which this server does not implement — mcp-remote bridges the API-key transport. Add to ~/Library/Application Support/Claude/claude_desktop_config.json, then restart the app.",
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    subtitle: 'CLI command',
    configLabel: 'Terminal',
    snippet: (endpoint) =>
      `claude mcp add --transport http invoice-mcp ${endpoint} \\\n  --header "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`,
    hint: 'Run in any project directory. Verify with `claude mcp list`.',
  },
  {
    id: 'http',
    name: 'Any HTTP client',
    subtitle: 'Streamable HTTP',
    configLabel: 'Raw request',
    snippet: (endpoint) => `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${TOKEN_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    hint: 'The server is stateless: no session id, one request per call. x-api-key works in place of the Authorization header.',
  },
];

export function McpSetupGuide() {
  const { meta } = useWorkspace();
  const [activeId, setActiveId] = useState<string>(mcpClients[0]?.id ?? '');
  const [copied, setCopied] = useState<string | null>(null);

  const active = mcpClients.find((client) => client.id === activeId) ?? mcpClients[0];
  const endpoint = meta?.mcp_endpoint;

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  if (!endpoint || !active) return <LoadingBlock className="h-64" />;

  const snippet = active.snippet(endpoint);

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="mcp-endpoint-heading"
        className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6"
      >
        <h2 id="mcp-endpoint-heading" className="text-body font-medium text-ink-900">
          Connect InvoiceMCP to your AI client
        </h2>
        <p className="mt-1 max-w-xl text-caption leading-relaxed text-ink-500">
          Pick your client below and paste the config. Agents get read-only access to your parsed
          invoices — nothing is written back to Gmail.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-canvas px-3 py-2 font-mono text-code text-ink-700 ring-1 ring-line">
            {endpoint}
          </code>
          <button
            type="button"
            onClick={() => copy('endpoint', endpoint)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-caption font-medium text-ink-700 transition-colors hover:bg-canvas"
          >
            {copied === 'endpoint' ? (
              <CheckIcon className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
            ) : (
              <CopyIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            {copied === 'endpoint' ? 'Copied' : 'Copy URL'}
          </button>
        </div>

        <p className="mt-3 text-caption text-ink-400">
          Replace <code className="font-mono">{TOKEN_PLACEHOLDER}</code> with the value of{' '}
          <code className="font-mono">MCP_API_KEY</code> from your server environment. The dashboard
          never displays it.
        </p>
      </section>

      <section aria-labelledby="mcp-clients-heading" className="space-y-4">
        <h2 id="mcp-clients-heading" className="sr-only">
          Setup instructions per client
        </h2>

        <div
          role="tablist"
          aria-label="MCP clients"
          className="flex gap-1.5 overflow-x-auto rounded-xl border border-line bg-surface p-1.5 shadow-card"
        >
          {mcpClients.map((client) => {
            const isActive = client.id === active.id;
            return (
              <button
                key={client.id}
                type="button"
                role="tab"
                id={`tab-${client.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${client.id}`}
                onClick={() => setActiveId(client.id)}
                className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-footnote transition-colors ${
                  isActive
                    ? 'bg-accent-soft font-medium text-accent-strong'
                    : 'text-ink-500 hover:bg-canvas hover:text-ink-900'
                }`}
              >
                {client.name}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`panel-${active.id}`}
          aria-labelledby={`tab-${active.id}`}
          className="clip-card rounded-xl border border-line bg-surface shadow-card"
        >
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 md:px-6">
            <div>
              <p className="text-footnote font-medium text-ink-900">{active.name}</p>
              <p className="mt-0.5 font-mono text-micro text-ink-400">{active.subtitle}</p>
            </div>
            <span className="ml-auto rounded-full bg-canvas px-2.5 py-1 text-micro font-medium text-ink-500 ring-1 ring-line">
              {active.configLabel}
            </span>
            <button
              type="button"
              onClick={() => copy(active.id, snippet)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-caption font-medium text-ink-700 transition-colors hover:bg-canvas"
            >
              {copied === active.id ? (
                <CheckIcon className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              {copied === active.id ? 'Copied' : 'Copy'}
            </button>
          </div>

          <pre className="overflow-x-auto border-y border-line bg-canvas px-5 py-4 font-mono text-code leading-relaxed text-ink-700 md:px-6">
            <code>{snippet}</code>
          </pre>

          <p className="px-5 py-3.5 text-caption text-ink-500 md:px-6">{active.hint}</p>
        </div>
      </section>

      <section
        aria-labelledby="mcp-tools-heading"
        className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6"
      >
        <h2 id="mcp-tools-heading" className="text-body font-medium text-ink-900">
          Tools your agent gets
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {mcpTools.map((tool) => (
            <li key={tool.name} className="rounded-lg border border-line bg-canvas px-3.5 py-3">
              <p className="font-mono text-code text-ink-900">{tool.name}</p>
              <p className="mt-1 text-caption text-ink-500">{tool.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
