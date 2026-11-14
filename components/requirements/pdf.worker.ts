// The pdf.js worker, with the polyfills Safari needs loaded first (imports run in order).
import "@/lib/pdfPolyfills";
import "pdfjs-dist/legacy/build/pdf.worker.min.mjs";
