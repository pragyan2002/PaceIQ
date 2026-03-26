import { notionClient } from "./client.js";
import "dotenv/config";

const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;
if (!PARENT_PAGE_ID) {
  console.error(
    "❌ NOTION_PARENT_PAGE_ID is not set. Add the ID of the Notion page where databases should be created."
  );
  process.exit(1);
}

async function createRunsDatabase(parentPageId: string): Promise<string> {
  const response = await notionClient.databases.create({
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: "Runs" } }],
    properties: {
      Name: {
        title: {},
      },
      Date: {
        date: {},
      },
      "Distance (km)": {
        number: { format: "number" },
      },
      "Duration (min)": {
        number: { format: "number" },
      },
      "Avg Pace (min/km)": {
        number: { format: "number" },
      },
      "Avg Heart Rate": {
        number: { format: "number" },
      },
      "Elevation (m)": {
        number: { format: "number" },
      },
      "Run Type": {
        select: {
          options: [
            { name: "Easy", color: "green" },
            { name: "Tempo", color: "orange" },
            { name: "Interval", color: "red" },
            { name: "Long", color: "blue" },
            { name: "Race", color: "purple" },
          ],
        },
      },
      "Effort (1-10)": {
        number: { format: "number" },
      },
      "Strava ID": {
        rich_text: {},
      },
      "Week Number": {
        formula: {
          expression: 'formatDate(prop("Date"), "W-YYYY")',
        },
      },
    },
  });
  return response.id;
}

async function createTrainingLogDatabase(
  parentPageId: string,
  runsDbId: string
): Promise<string> {
  const response = await notionClient.databases.create({
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: "Training Log" } }],
    properties: {
      Name: {
        title: {},
      },
      Date: {
        date: {},
      },
      "Sleep (hrs)": {
        number: { format: "number" },
      },
      "Energy Level": {
        select: {
          options: [
            { name: "High", color: "green" },
            { name: "Normal", color: "blue" },
            { name: "Low", color: "orange" },
            { name: "Exhausted", color: "red" },
          ],
        },
      },
      "Injury Flag": {
        checkbox: {},
      },
      "Injury Location": {
        rich_text: {},
      },
      Notes: {
        rich_text: {},
      },
      "Linked Run": {
        relation: {
          database_id: runsDbId,
          single_property: {},
        },
      },
    },
  });
  return response.id;
}

async function createRacesDatabase(parentPageId: string): Promise<string> {
  const response = await notionClient.databases.create({
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: "Races" } }],
    properties: {
      Name: {
        title: {},
      },
      Date: {
        date: {},
      },
      Distance: {
        select: {
          options: [
            { name: "5K", color: "green" },
            { name: "10K", color: "blue" },
            { name: "Half Marathon", color: "orange" },
            { name: "Marathon", color: "red" },
            { name: "Ultra", color: "purple" },
          ],
        },
      },
      "Goal Time": {
        rich_text: {},
      },
      Status: {
        select: {
          options: [
            { name: "Upcoming", color: "blue" },
            { name: "Completed", color: "green" },
            { name: "DNS", color: "gray" },
            { name: "DNF", color: "red" },
          ],
        },
      },
      "Result Time": {
        rich_text: {},
      },
      Notes: {
        rich_text: {},
      },
    },
  });
  return response.id;
}

async function createCoachSessionsDatabase(
  parentPageId: string
): Promise<string> {
  const response = await notionClient.databases.create({
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: "Coach Sessions" } }],
    properties: {
      Name: {
        title: {},
      },
      Date: {
        date: {},
      },
      Question: {
        rich_text: {},
      },
      Response: {
        rich_text: {},
      },
      "Tools Used": {
        rich_text: {},
      },
      "Insight Type": {
        select: {
          options: [
            { name: "Race Readiness", color: "blue" },
            { name: "Injury Analysis", color: "red" },
            { name: "Volume Review", color: "green" },
            { name: "Race Planning", color: "purple" },
            { name: "General", color: "gray" },
          ],
        },
      },
      "Week Number": {
        formula: {
          expression: 'formatDate(prop("Date"), "W-YYYY")',
        },
      },
    },
  });
  return response.id;
}

async function main() {
  console.log("🏃 PaceIQ Setup — Creating Notion databases...\n");

  try {
    console.log("Creating Runs database...");
    const runsDbId = await createRunsDatabase(PARENT_PAGE_ID!);
    console.log(`✅ Runs database created: ${runsDbId}`);

    console.log("Creating Training Log database...");
    const logDbId = await createTrainingLogDatabase(PARENT_PAGE_ID!, runsDbId);
    console.log(`✅ Training Log database created: ${logDbId}`);

    console.log("Creating Races database...");
    const racesDbId = await createRacesDatabase(PARENT_PAGE_ID!);
    console.log(`✅ Races database created: ${racesDbId}`);

    console.log("Creating Coach Sessions database...");
    const sessionsDbId = await createCoachSessionsDatabase(PARENT_PAGE_ID!);
    console.log(`✅ Coach Sessions database created: ${sessionsDbId}`);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Add these to your .env file:\n");
    console.log(`NOTION_RUNS_DB_ID=${runsDbId}`);
    console.log(`NOTION_LOG_DB_ID=${logDbId}`);
    console.log(`NOTION_RACES_DB_ID=${racesDbId}`);
    console.log(`NOTION_SESSIONS_DB_ID=${sessionsDbId}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("Setup complete! Copy the IDs above into .env, then run: npm start");
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ Setup failed: ${error.message}`);
      if (error.message.includes("Could not find page")) {
        console.error(
          "Make sure NOTION_PARENT_PAGE_ID is a valid page ID and that your integration has access to it."
        );
      }
    }
    process.exit(1);
  }
}

main();
