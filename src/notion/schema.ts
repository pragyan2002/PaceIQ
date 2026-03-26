import "dotenv/config";

export interface NotionSchema {
  runsDbId: string;
  logDbId: string;
  racesDbId: string;
  sessionsDbId: string;
}

/**
 * Resolve and return the four Notion database IDs from environment variables.
 * Throws with setup instructions if any ID is missing.
 */
export function getSchema(): NotionSchema {
  const runsDbId = process.env.NOTION_RUNS_DB_ID;
  const logDbId = process.env.NOTION_LOG_DB_ID;
  const racesDbId = process.env.NOTION_RACES_DB_ID;
  const sessionsDbId = process.env.NOTION_SESSIONS_DB_ID;

  const missing: string[] = [];
  if (!runsDbId) missing.push("NOTION_RUNS_DB_ID");
  if (!logDbId) missing.push("NOTION_LOG_DB_ID");
  if (!racesDbId) missing.push("NOTION_RACES_DB_ID");
  if (!sessionsDbId) missing.push("NOTION_SESSIONS_DB_ID");

  if (missing.length > 0) {
    throw new Error(
      `Missing Notion database IDs: ${missing.join(", ")}.\n` +
        `Run 'npm run setup' first to create the databases, then copy the printed IDs into your .env file.`
    );
  }

  return {
    runsDbId: runsDbId!,
    logDbId: logDbId!,
    racesDbId: racesDbId!,
    sessionsDbId: sessionsDbId!,
  };
}
