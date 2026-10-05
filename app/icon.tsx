import { appIcon } from "@/lib/appIcon";

// 32 px for the browser tab; 192 and 512 are the install icons referenced by the manifest.
export function generateImageMetadata() {
  return [32, 192, 512].map((n) => ({ id: String(n), size: { width: n, height: n }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const n = Number(await id);
  return appIcon(n, n === 32 ? 0.06 : 0.2);
}
