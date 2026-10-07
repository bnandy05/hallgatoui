"use client";

import "@/lib/promiseWithResolvers";
import { documentText, MAX_PDF_BYTES, MAX_PDF_PAGES, type PdfTextItem } from "@/lib/rules/extract/pdf";

// Reads a requirements PDF's text layer in the browser with pdf.js. The file never leaves the
// device; only the text goes on, into the same review as pasted text. pdf.js is loaded on demand,
// from its legacy build: the modern one needs very recent browsers (Safari 17 and older fail). Even
// the legacy build assumes Promise.withResolvers (Safari 17.4+), so it is polyfilled here and in
// our worker entry (pdf.worker.ts).

export class PdfTextError extends Error {}

export async function readPdfText(file: File): Promise<string> {
  if (file.size > MAX_PDF_BYTES) throw new PdfTextError("A PDF legfeljebb 10 MB lehet.");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("./pdf.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  let task: ReturnType<typeof pdfjs.getDocument> | undefined;
  let doc;
  try {
    task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    doc = await task.promise;
  } catch (e) {
    void task?.destroy();
    const name = (e as Error)?.name;
    if (name === "PasswordException") throw new PdfTextError("A PDF jelszóval védett.");
    if (name === "InvalidPDFException") throw new PdfTextError("Ezt a fájlt nem tudtuk PDF-ként megnyitni.");
    throw e; // a browser or pdf.js failure: shown with its message, so it can be reported
  }
  try {
    const pages: PdfTextItem[][] = [];
    for (let i = 1; i <= Math.min(doc.numPages, MAX_PDF_PAGES); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.flatMap((it) => ("str" in it ? [it] : [])));
      page.cleanup();
    }
    const text = documentText(pages);
    if (text.replace(/\s/g, "").length < 40) {
      throw new PdfTextError("Ebben a PDF-ben nincs kijelölhető szöveg (valószínűleg szkennelt kép). Másold be a szöveget kézzel.");
    }
    return text;
  } finally {
    void task.destroy();
  }
}
