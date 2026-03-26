import "dotenv/config";
import { getSchema } from "./notion/schema.js";
import { syncActivities } from "./strava/sync.js";
import { startCli } from "./cli.js";

async function main() {
  try {
    getSchema();
  } catch {
    console.error(
      "Notion database IDs not found. Run 'npm run setup' first, then add the IDs to .env."
    );
    process.exit(1);
  }

  try {
    console.log("Syncing your runs from Strava...");
    await syncActivities();
    console.log("\nReady. Starting PaceIQ...\n");
    startCli();
  } catch (err) {
    console.error(
      "Startup failed:",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }
}

main();
