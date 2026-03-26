import "dotenv/config";
import { getSchemaAsync } from "./notion/schema.js";
import { syncActivities } from "./strava/sync.js";
import { startServer } from "./server/server.js";

async function main() {
  try {
    await getSchemaAsync();
  } catch (err) {
    console.error(
      "Notion database discovery failed:",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }

  try {
    console.log("Syncing your runs from Strava...");
    await syncActivities();
    console.log("\nReady. Starting PaceIQ...\n");
    startServer();
  } catch (err) {
    console.error(
      "Startup failed:",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }
}

main();
