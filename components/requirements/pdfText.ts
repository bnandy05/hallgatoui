"use client";

import { documentText, MAX_PDF_BYTES, MAX_PDF_PAGES, type PdfTextItem } from "@/lib/rules/extract/pdf";

// Reads a requirements PDF's text layer in the browser with pdf.js. The file never leaves the
// device; only the text goes on, into the same review as pasted text. pdf.js is loaded on demand,
// from its legacy build: the modern one needs very recent browsers (Safari 17 and older fail).

export class PdfTextError extends Error {}

export async function readPdfText(file: File): Promise<string> {
  if (file.size > MAX_PDF_BYTES) throw new PdfTextError("A PDF legfeljebb 10 MB lehet.");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url), {
      type: "module",
    });
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    void task.destroy();
    if ((e as Error)?.name === "PasswordException") throw new PdfTextError("A PDF jelszóval védett.");
    throw new PdfTextError("Ezt a fájlt nem tudtuk PDF-ként megnyitni.");
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
