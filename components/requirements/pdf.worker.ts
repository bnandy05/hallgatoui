// The pdf.js worker, with the polyfills it needs on older Safari loaded first (imports run in order).
import "@/lib/promiseWithResolvers";
import "pdfjs-dist/legacy/build/pdf.worker.min.mjs";
