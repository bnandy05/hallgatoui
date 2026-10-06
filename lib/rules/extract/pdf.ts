// Plain text from a PDF's text layer, laid out so `segment` reads it like pasted text: one line per
// visual line, a space where the glyph runs leave a gap (a sentence running over a page break is
// rejoined by `unwrapLines`). Pure; the
// browser side (pdf.js, components/requirements/pdfText.ts) only hands over each page's items.

export interface PdfTextItem {
  str: string;
  hasEOL: boolean;
  transform: number[]; // [a, b, c, d, x, y]
  width: number;
  height: number;
}

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 40;

export function pageText(items: PdfTextItem[]): string {
  let out = "";
  let prev: PdfTextItem | null = null;
  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    if (prev && !out.endsWith("\n")) {
      const size = Math.max(prev.height, item.height, 1);
      const px = prev.transform[4] + prev.width;
      if (Math.abs(y - prev.transform[5]) > size * 0.5) out += "\n";
      else if (x - px > size * 0.15 && !/\s$/.test(out) && !/^\s/.test(item.str)) out += " ";
    }
    out += item.str;
    if (item.hasEOL) out += "\n";
    if (item.str || item.hasEOL) prev = item;
  }
  return out.replace(/[ \t]+\n/g, "\n").trim();
}

export function documentText(pages: PdfTextItem[][]): string {
  return pages
    .map(pageText)
    .filter(Boolean)
    .join("\n");
}
