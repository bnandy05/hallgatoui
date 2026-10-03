import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
// Resolves "@/x" to <repo>/x and adds the .ts/.tsx extension Next's bundler would infer.
export async function resolve(spec, ctx, next) {
  let target = spec;
  if (spec.startsWith("@/")) target = new URL(spec.slice(2), root).href;
  if ((target.startsWith("file:") || target.startsWith(".")) && !/\.[cm]?[jt]sx?$/.test(target)) {
    const base = target.startsWith(".") ? new URL(target, ctx.parentURL).href : target;
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      if (existsSync(fileURLToPath(base + ext))) return next(base + ext, ctx);
    }
  }
  return next(target, ctx);
}
