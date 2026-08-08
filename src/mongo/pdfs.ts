import { GridFSBucket } from 'mongodb';
import { mongoClient, mongoDb } from './client.js';

let bucket: GridFSBucket | undefined;

function pdfBucket(): GridFSBucket {
  if (!bucket) {
    bucket = new GridFSBucket(mongoDb(), { bucketName: 'invoice_pdfs' });
  }
  return bucket;
}

/**
 * Stores a PDF under the given UUID (mirrors billing.invoices.pdf_id).
 * The UUID is the GridFS filename; re-runs replace any prior upload.
 */
export async function putPdf(id: string, data: Buffer, originalFilename: string): Promise<void> {
  await mongoClient.connect();
  const b = pdfBucket();
  const prior = await b.find({ filename: id }).toArray();
  for (const file of prior) {
    await b.delete(file._id);
  }
  await new Promise<void>((resolve, reject) => {
    const stream = b.openUploadStream(id, {
      metadata: { contentType: 'application/pdf', originalFilename },
    });
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    stream.end(data);
  });
}

/**
 * Removes the blob stored under `id`, if it is still there.
 *
 * Deliberately forgiving about a miss. The caller deletes the Postgres row that
 * points here, and a blob that has already gone (a half-finished earlier delete,
 * a `putPdf` that replaced it) must not be able to block that — the row is the
 * thing that makes the invoice visible, and an orphaned blob costs storage only.
 */
export async function deletePdf(id: string): Promise<void> {
  await mongoClient.connect();
  const b = pdfBucket();
  const files = await b.find({ filename: id }).toArray();
  for (const file of files) {
    await b.delete(file._id);
  }
}

export async function getPdf(id: string): Promise<Buffer> {
  await mongoClient.connect();
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    pdfBucket()
      .openDownloadStreamByName(id)
      .on('data', (c: Buffer) => chunks.push(c))
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks)));
  });
}
