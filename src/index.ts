import "dotenv/config";
import { getSchemaAsync } from "./notion/schema.js";
import { syncActivities } from "./strava/sync.js";
import { startServer } from "./server/server.js";
import { scheduleWeeklyReport } from "./agent/weekly_report.js";

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

    // Generate weekly report if not already created this week
    try {
      await scheduleWeeklyReport();
    } catch (err) {
      console.warn(
        "Weekly report generation skipped:",
        err instanceof Error ? err.message : err
      );
    }

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
