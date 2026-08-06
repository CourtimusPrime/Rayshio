import OpenAI from 'openai';
import type { ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { requireConfig } from '../config.js';

let client: OpenAI | undefined;

export function openrouter(): OpenAI {
  if (!client) {
    const { OPENROUTER_API_KEY } = requireConfig('OPENROUTER_API_KEY');
    client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/courtsmac/invoice-mcp',
        'X-Title': 'InvoiceMCP',
      },
    });
  }
  return client;
}

/**
 * Zod → JSON Schema for a `strict` structured-output call.
 *
 * `$refStrategy: 'none'` is load-bearing. By default a zod schema reused across
 * fields (`isoDate` appears six times in the extraction schema) is hoisted into
 * `$defs` and referenced, and OpenAI rejects the result outright:
 *
 *   Invalid schema for response_format 'invoice_extraction':
 *   In context=('properties','due_date'), reference can only point to
 *   definitions defined at the top level of the schema.
 *
 * That 400 killed every call to the escalation model, and because the caller
 * treats an escalation failure as "could not improve on the first attempt", it
 * looked like a reconciliation failure rather than a broken request. Inlining
 * costs a few hundred bytes per request and removes the whole class of problem.
 *
 * Conversion lives here, not at the call sites, so a new caller cannot
 * reintroduce it by passing a schema built the default way.
 */
function providerJsonSchema(schema: ZodType): Record<string, unknown> {
  const json = zodToJsonSchema(schema, { $refStrategy: 'none' }) as Record<string, unknown>;
  return strictify(json) as Record<string, unknown>;
}

/**
 * Brings a generated schema up to what `strict: true` demands.
 *
 * Every object must list *all* of its properties in `required` and forbid
 * additional ones. Zod's notion of optional does not survive the trip: a field
 * carrying `.default(null)` is emitted as optional, and the provider answers
 *
 *   'required' is required to be supplied and to be an array including every
 *   key in properties. Missing 'vendor_name'.
 *
 * Requiring it on the wire costs nothing, because the fields in question are
 * already nullable — the model returns an explicit null instead of omitting the
 * key, and the zod default stays as the parse-side safety net for a model that
 * ignores the contract.
 */
function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (node === null || typeof node !== 'object') return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = strictify(value);
  }

  const properties = out.properties;
  if (out.type === 'object' && properties && typeof properties === 'object') {
    out.required = Object.keys(properties as Record<string, unknown>);
    out.additionalProperties = false;
  }
  return out;
}

/** One structured-output chat call. Returns the raw content string (JSON expected). */
export async function completeJson(opts: {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: ZodType;
}): Promise<string> {
  const res = await openrouter().chat.completions.create({
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: opts.schemaName,
        strict: true,
        schema: providerJsonSchema(opts.schema),
      },
    },
    temperature: 0,
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error(`empty LLM response (model=${opts.model})`);
  return content;
}
