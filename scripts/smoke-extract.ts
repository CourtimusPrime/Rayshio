// Live smoke test: PDF → text → OpenRouter extraction → reconciliation.
// Run: tsx scripts/smoke-extract.ts [path/to/invoice.pdf]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractInvoice } from '../src/llm/extract.js';
import { pdfToText } from '../src/pipeline/pdf-text.js';
import { reconcile } from '../src/pipeline/reconcile.js';

const pdfPath =
  process.argv[2] ?? join(import.meta.dirname, '../test/fixtures/pdfs/neon-multipage.pdf');

const text = await pdfToText(readFileSync(pdfPath));
console.log('--- extracted text ---');
console.log(text);
console.log('\n--- LLM extraction ---');
const extraction = await extractInvoice(text);
console.log(JSON.stringify(extraction, null, 2));

const rec = reconcile(extraction);
console.log(
  `\nreconcile: ${rec.ok ? 'PASS' : 'FAIL'} (sum=${rec.sum} total=${rec.total} tolerance=${rec.tolerance})`,
);
process.exit(rec.ok ? 0 : 1);
