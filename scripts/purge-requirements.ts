// One-off cleanup of the dropped requirements tracker (Követelmények) in production Upstash.
// Lists everything first; deletes only with --yes.
//
//   UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=… \
//     node --import ./test/alias-loader.mjs scripts/purge-requirements.ts [--yes]
//
// Removes the keys uni:*, tpl:*, tplu:*, jevc:*, rl:kov:*, rl:jev:* and strips the tracker's
// fields from every data:<userId> document (compare-and-set, so a concurrent save wins and the
// next save strips it anyway).

import { Redis } from "@upstash/redis";
import { createRedisAccountStore, redisCredentials } from "@/lib/server/account/redisStore";
import { withoutRequirementData } from "@/lib/legacyRequirements";

const PATTERNS = ["uni:*", "tpl:*", "tplu:*", "jevc:*", "rl:kov:*", "rl:jev:*"];
const apply = process.argv.includes("--yes");

const creds = redisCredentials();
if (!creds) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}
const redis = new Redis(creds);
const store = createRedisAccountStore(creds.url, creds.token);

async function scanAll(match: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, { match, count: 500 });
    cursor = String(next);
    found.push(...keys);
  } while (cursor !== "0");
  return found;
}

for (const pattern of PATTERNS) {
  const keys = await scanAll(pattern);
  console.log(`${pattern}: ${keys.length} key(s)`);
  if (apply) for (let i = 0; i < keys.length; i += 100) await redis.del(...keys.slice(i, i + 100));
}

let docs = 0;
for (const key of await scanAll("data:*")) {
  const userId = key.slice("data:".length);
  const doc = await store.getData(userId);
  if (!doc) continue;
  const clean = withoutRequirementData(doc.data);
  if (JSON.stringify(clean) === JSON.stringify(doc.data)) continue;
  docs++;
  console.log(`${key}: has requirements data`);
  if (apply) {
    const res = await store.casData(userId, doc.version, { updatedAt: new Date().toISOString(), data: clean, exportOptions: doc.exportOptions });
    if (!res.ok) console.log(`  ${key}: changed meanwhile, left to the next save`);
  }
}
console.log(`${docs} data document(s) with requirements data`);
console.log(apply ? "Deleted." : "Dry run. Re-run with --yes to delete.");
