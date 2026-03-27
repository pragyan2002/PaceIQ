import { notionClient } from "./client.js";
import "dotenv/config";

export interface NotionSchema {
  runsDbId: string;
  logDbId: string;
  racesDbId: string;
  sessionsDbId: string;
  reportsDbId?: string;
}

// In-memory cache for discovered IDs
let cachedSchema: NotionSchema | null = null;

/**
 * Search the Notion workspace for databases by their "PaceIQ" title prefix.
 */
async function discoverDatabases(): Promise<NotionSchema> {
  const dbMap: Record<string, string> = {};
  let cursor: string | undefined = undefined;

  do {
    const response = await notionClient.search({
      filter: { value: "database", property: "object" },
      start_cursor: cursor,
      page_size: 100,
    });

    for (const result of response.results) {
      if (result.object !== "database") continue;
      const db = result as unknown as {
        id: string;
        title: Array<{ plain_text: string }>;
      };
      const title =
        db.title?.map((t) => t.plain_text).join("").toLowerCase() ?? "";

      if (title === "paceiq runs" || title === "runs") dbMap.runsDbId = db.id;
      else if (title === "paceiq training log" || title === "training log") dbMap.logDbId = db.id;
      else if (title === "paceiq races" || title === "races") dbMap.racesDbId = db.id;
      else if (title === "paceiq coach sessions" || title === "coach sessions") dbMap.sessionsDbId = db.id;
      else if (title === "paceiq weekly reports" || title === "weekly reports") dbMap.reportsDbId = db.id;
    }

    cursor = response.has_more
      ? (response.next_cursor ?? undefined)
      : undefined;
  } while (cursor);

  const required: Array<[string, string]> = [
    ["runsDbId", "Runs"],
    ["logDbId", "Training Log"],
    ["racesDbId", "Races"],
    ["sessionsDbId", "Coach Sessions"],
  ];

  for (const [key, name] of required) {
    if (!dbMap[key]) {
      throw new Error(
        `Could not find Notion database '${name}'. ` +
          `Make sure you ran npm run setup and shared the parent page with your integration.`
      );
    }
  }

  return dbMap as unknown as NotionSchema;
}

/**
 * Resolve Notion database IDs from environment variables (synchronous).
 * Throws if any required ID is missing.
 */
export function getSchema(): NotionSchema {
  if (cachedSchema) return cachedSchema;

  const runsDbId = process.env.NOTION_RUNS_DB_ID;
  const logDbId = process.env.NOTION_LOG_DB_ID;
  const racesDbId = process.env.NOTION_RACES_DB_ID;
  const sessionsDbId = process.env.NOTION_SESSIONS_DB_ID;
  const reportsDbId = process.env.NOTION_REPORTS_DB_ID;

  if (runsDbId && logDbId && racesDbId && sessionsDbId) {
    cachedSchema = { runsDbId, logDbId, racesDbId, sessionsDbId, reportsDbId };
    return cachedSchema;
  }

  // Signal that async discovery is needed
  throw new Error("NEEDS_DISCOVERY");
}

/**
 * Async version: tries env vars first, falls back to auto-discovery via Notion search API.
 */
export async function getSchemaAsync(): Promise<NotionSchema> {
  if (cachedSchema) return cachedSchema;

  try {
    return getSchema();
  } catch {
    console.log("Auto-discovering Notion databases...");
    cachedSchema = await discoverDatabases();
    console.log("Auto-discovered Notion databases \u2713");
    return cachedSchema;
  }
}
