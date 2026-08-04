import { extractText, getDocumentProxy } from 'unpdf';

/** Extracts text from every page, joined with page markers the extraction prompt understands. */
export async function pdfToText(pdf: Buffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { totalPages, text } = await extractText(doc, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return pages
    .map((pageText, i) => `--- page ${i + 1} of ${totalPages} ---\n${pageText}`)
    .join('\n\n');
}
