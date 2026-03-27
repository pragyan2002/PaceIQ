import { getAccessToken, getActivities } from "./client.js";
import { queryDatabase, createPage } from "../notion/client.js";
import type { CreatePageParameters } from "@notionhq/client/build/src/api-endpoints.js";
import { getSchema, getSchemaAsync } from "../notion/schema.js";
import "dotenv/config";

const SYNC_DAYS = parseInt(process.env.STRAVA_SYNC_DAYS || "30", 10);

/**
 * Check if a run with the given Strava ID already exists in the Runs database.
 */
async function stravaIdExists(
  runsDbId: string,
  stravaId: string
): Promise<boolean> {
  const results = await queryDatabase(runsDbId, {
    property: "Strava ID",
    rich_text: { equals: stravaId },
  });
  return results.length > 0;
}

/**
 * Sync Strava activities into the Notion Runs database.
 * Skips activities that already exist (matched by Strava ID).
 */
export async function syncActivities(): Promise<void> {
  const { runsDbId } = getSchema();

  console.log(`Fetching Strava access token...`);
  const accessToken = await getAccessToken();

  console.log(`Fetching all activities from Strava...`);
  const activities = await getActivities(accessToken, 0);
  console.log(`Found ${activities.length} activities on Strava.`);

  let synced = 0;
  let skipped = 0;

  for (const activity of activities) {
    const stravaId = String(activity.id);

    if (await stravaIdExists(runsDbId, stravaId)) {
      skipped++;
      continue;
    }

    const distanceKm = activity.distance / 1000;
    const durationMin = activity.moving_time / 60;
    const avgPace = distanceKm > 0 ? durationMin / distanceKm : 0;

    const properties: CreatePageParameters["properties"] = {
      Name: {
        title: [{ text: { content: activity.name } }],
      },
      Date: {
        date: { start: activity.start_date.split("T")[0] },
      },
      "Distance (km)": {
        number: Math.round(distanceKm * 100) / 100,
      },
      "Duration (min)": {
        number: Math.round(durationMin * 100) / 100,
      },
      "Avg Pace (min/km)": {
        number: Math.round(avgPace * 100) / 100,
      },
      "Elevation (m)": {
        number: Math.round(activity.total_elevation_gain),
      },
      "Run Type": {
        select: { name: "Easy" },
      },
      "Avg Heart Rate": {
        number: Math.round(activity.average_heartrate ?? 0),
      },
      "Strava ID": {
        rich_text: [{ text: { content: stravaId } }],
      },
    };

    await createPage(runsDbId, properties);
    synced++;
    console.log(`  ✅ ${activity.name} — ${distanceKm.toFixed(1)} km`);
  }

  console.log(
    `\nSynced ${synced} activities, skipped ${skipped} duplicates.`
  );
}

// Run directly via `npm run sync`
if (process.argv[1]?.includes("sync")) {
  getSchemaAsync()
    .then(() => syncActivities())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Sync failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
