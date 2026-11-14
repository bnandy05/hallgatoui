// What pdf.js (even its legacy build) expects from the browser but Safari lacks. Imported for its
// side effects, before pdf.js, on the page (components/requirements/pdfText.ts) and in the pdf.js
// worker (components/requirements/pdf.worker.ts).
//
// - Promise.withResolvers: Safari 17.4+.
// - Async iteration of a ReadableStream (`for await (const x of stream)`): not in Safari, even 26.
//   pdf.js reads text content and inflates data this way; Safari throws "undefined is not a function".

if (typeof (Promise as { withResolvers?: unknown }).withResolvers !== "function") {
  Object.defineProperty(Promise, "withResolvers", {
    configurable: true,
    writable: true,
    value: function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    },
  });
}

if (typeof ReadableStream !== "undefined" && typeof (ReadableStream.prototype as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] !== "function") {
  const values = async function* <R>(this: ReadableStream<R>, options?: { preventCancel?: boolean }): AsyncGenerator<R, void, undefined> {
    const reader = this.getReader();
    let finished = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          return;
        }
        yield value;
      }
    } finally {
      // Leaving the loop early cancels the stream, as the native iterator does.
      if (!finished && !options?.preventCancel) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
  for (const key of ["values", Symbol.asyncIterator] as const) {
    Object.defineProperty(ReadableStream.prototype, key, { configurable: true, writable: true, value: values });
  }
}

export {};
