import {
  checkCreateLimit,
  generateCredentials,
  hashSecret,
  readSnapshotBody,
  requireKv,
  storageErrorResponse,
  subKey,
  TTL_SECONDS,
  type StoredSubscription,
} from "@/lib/server/subscription";

// POST route handlers are never cached.

/** Creates a calendar subscription and returns its public token and private secret. */
export async function POST(req: Request): Promise<Response> {
  const kv = requireKv();
  if (kv instanceof Response) return kv;

  const limited = await checkCreateLimit(kv, req);
  if (limited) return limited;

  const snapshot = await readSnapshotBody(req);
  if (snapshot instanceof Response) return snapshot;

  const { token, secret } = generateCredentials();
  const stored: StoredSubscription = {
    secretHash: hashSecret(secret),
    snapshot,
    updatedAt: new Date().toISOString(),
  };
  try {
    await kv.set(subKey(token), stored, TTL_SECONDS);
  } catch {
    return storageErrorResponse();
  }
  return Response.json({ token, secret });
}
