import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import type { AppData } from "@/lib/types";
import { errorResponse } from "@/lib/server/subscription";
import { checkOrigin, guarded, json, readJson, requireUser } from "@/lib/server/auth/http";
import { MAX_DATA_BYTES, saveData, validateAppData, validateExportOptions } from "@/lib/server/validate";

// The signed-in user's data document: GET (optionally "only if newer than ?since=") and PUT with
// compare-and-set on the version. The client merges on a 409 and retries.

const EMPTY: AppData = {
  version: 1,
  courses: [],
  deadlines: [],
  customPlatforms: [],
  feeds: [],
  ignoredDuplicatePairs: [],
  classSessions: [],
  timetableSources: [],
};

export function GET(req: Request) {
  return guarded(async () => {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { store } = auth.deps;
    const userId = auth.user.id;

    const version = await store.getDataVersion(userId);
    const since = new URL(req.url).searchParams.get("since");
    if (since !== null && since !== "" && Number(since) === version) return json({ unchanged: true, version });
    if (version === 0) {
      return json({ version: 0, updatedAt: null, data: EMPTY, exportOptions: DEFAULT_EXPORT_OPTIONS });
    }
    const doc = await store.getData(userId);
    if (!doc) return json({ version: 0, updatedAt: null, data: EMPTY, exportOptions: DEFAULT_EXPORT_OPTIONS });
    return json({ version: doc.version, updatedAt: doc.updatedAt, data: doc.data, exportOptions: doc.exportOptions });
  });
}

export function PUT(req: Request) {
  return guarded(async () => {
    const bad = checkOrigin(req);
    if (bad) return bad;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const body = await readJson(req, MAX_DATA_BYTES + 20_000);
    if (body instanceof Response) return body;
    const { baseVersion, data, exportOptions } = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    if (typeof baseVersion !== "number" || !Number.isInteger(baseVersion) || baseVersion < 0) {
      return errorResponse("Hibás vagy hiányos adatok", 400);
    }
    const validData = validateAppData(data);
    if (!validData) return errorResponse("Hibás vagy hiányos adatok", 400);
    const options = validateExportOptions(exportOptions);
    if (Buffer.byteLength(JSON.stringify({ data: validData, exportOptions: options })) > MAX_DATA_BYTES) {
      return errorResponse("Túl sok adat (legfeljebb 900 KB)", 413);
    }

    const result = await saveData(auth.deps.store, auth.user.id, baseVersion, validData, options, auth.deps.now());
    if (result.ok) return json({ version: result.version });
    const current = result.current;
    return json(
      {
        conflict: true,
        version: current?.version ?? 0,
        data: current?.data ?? EMPTY,
        exportOptions: current?.exportOptions ?? DEFAULT_EXPORT_OPTIONS,
      },
      undefined,
      409
    );
  });
}
