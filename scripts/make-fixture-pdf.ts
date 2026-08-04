// Generates test/fixtures/pdfs/neon-multipage.pdf — a synthetic 2-page invoice
// mimicking the Neon "1 of 2" case: line items split across pages, total on page 2.
// Run: tsx scripts/make-fixture-pdf.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PAGE1 = [
  'Neon Inc.                                    INVOICE',
  'Invoice number: NEON-2026-0342',
  'Invoice date: 2026-03-01    Due date: 2026-03-15',
  'Billing period: 2026-02-01 to 2026-02-28',
  'Billed to: techteam@nczgroup.com',
  '',
  'Description                Qty      Unit       Rate     Amount',
  'Compute                  102.50   CU-hour     $0.41     $42.03',
  'Storage                   18.20   GB-month    $0.35      $6.37',
  'Branch compute             4.00   CU-hour     $0.41      $1.64',
  '',
  'Page 1 of 2',
];

const PAGE2 = [
  'Neon Inc.                       Invoice NEON-2026-0342',
  '',
  'Description                Qty      Unit       Rate     Amount',
  'Data transfer              3.10   GB          $0.09      $0.28',
  'Support plan               1.00   month       $5.00      $5.00',
  '',
  'Subtotal                                                $55.32',
  'Discount (startup program)                              -$5.53',
  'Total due                                               $49.79',
  '',
  'Page 2 of 2',
];

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pageStream(lines: string[]): string {
  const ops = ['BT', '/F1 10 Tf', '12 TL', '50 780 Td'];
  for (const line of lines) {
    ops.push(`(${esc(line)}) Tj`, 'T*');
  }
  ops.push('ET');
  return ops.join('\n');
}

function buildPdf(pages: string[][]): Buffer {
  const objects: string[] = [];
  const pageCount = pages.length;
  // obj 1: catalog, obj 2: pages, obj 3: font, then per page: page obj + content obj
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  for (let i = 0; i < pageCount; i++) {
    const contentRef = `${5 + i * 2} 0 R`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentRef} >>`,
    );
    const stream = pageStream(pages[i] as string[]);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    out += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const outPath = join(import.meta.dirname, '../test/fixtures/pdfs/neon-multipage.pdf');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buildPdf([PAGE1, PAGE2]));
console.log(`wrote ${outPath}`);
