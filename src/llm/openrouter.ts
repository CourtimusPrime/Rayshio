import OpenAI from 'openai';
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

/** One structured-output chat call. Returns the raw content string (JSON expected). */
export async function completeJson(opts: {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
}): Promise<string> {
  const res = await openrouter().chat.completions.create({
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: opts.schemaName, strict: true, schema: opts.jsonSchema },
    },
    temperature: 0,
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error(`empty LLM response (model=${opts.model})`);
  return content;
}
