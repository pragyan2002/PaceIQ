import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { queryDatabase, createPage } from "../notion/client.js";
import { getSchema } from "../notion/schema.js";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Properties = PageObjectResponse["properties"];
type PropValue = Properties[string];

function prop(page: PageObjectResponse, name: string): PropValue {
  return page.properties[name];
}

function getTitle(p: PropValue): string {
  return p.type === "title"
    ? p.title.map((t) => t.plain_text).join("")
    : "";
}

function getNumber(p: PropValue): number {
  return p.type === "number" ? (p.number ?? 0) : 0;
}

function getDate(p: PropValue): string {
  return p.type === "date" ? (p.date?.start ?? "") : "";
}

function getRichText(p: PropValue): string {
  return p.type === "rich_text"
    ? p.rich_text.map((t) => t.plain_text).join("")
    : "";
}

function getSelect(p: PropValue): string {
  return p.type === "select" ? (p.select?.name ?? "") : "";
}

function getCheckbox(p: PropValue): boolean {
  return p.type === "checkbox" ? p.checkbox : false;
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function isoWeek(dateStr: string): string {
  const d = new Date(dateStr);
  // ISO week calculation
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayOfYear =
    Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
  const weekDay = d.getDay() || 7; // Mon=1 ... Sun=7
  const weekNum = Math.ceil((dayOfYear - weekDay + 10) / 7);
  // Handle year boundary: if weekNum > 52 and it's January, it belongs to prev year's last week
  const year =
    weekNum === 1 && d.getMonth() === 11
      ? d.getFullYear() + 1
      : weekNum >= 52 && d.getMonth() === 0
        ? d.getFullYear() - 1
        : d.getFullYear();
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

// ── Tools ────────────────────────────────────────────────────────────────────

const getRecentRuns = new DynamicStructuredTool({
  name: "get_recent_runs",
  description:
    "Query the Runs database for activities in the last N days. Returns an array of run summaries with distance, pace, heart rate, etc.",
  schema: z.object({
    days: z.number().describe("Number of days to look back"),
  }),
  func: async ({ days }) => {
    const { runsDbId } = getSchema();
    const since = daysAgoISO(days);

    const pages = await queryDatabase(
      runsDbId,
      {
        property: "Date",
        date: { on_or_after: since },
      },
      [{ property: "Date", direction: "descending" }]
    );

    const runs = (pages as PageObjectResponse[]).map((page) => ({
      name: getTitle(prop(page, "Name")),
      date: getDate(prop(page, "Date")),
      distance_km: getNumber(prop(page, "Distance (km)")),
      duration_min: getNumber(prop(page, "Duration (min)")),
      avg_pace: getNumber(prop(page, "Avg Pace (min/km)")),
      heart_rate: getNumber(prop(page, "Avg Heart Rate")),
      elevation: getNumber(prop(page, "Elevation (m)")),
      run_type: getSelect(prop(page, "Run Type")),
    }));

    return JSON.stringify(runs);
  },
});

const getWeeklyMileage = new DynamicStructuredTool({
  name: "get_weekly_mileage",
  description:
    "Group runs by ISO week and return weekly km totals, run counts, and longest run for each week. Useful for analysing training load trends.",
  schema: z.object({
    weeks: z.number().describe("Number of weeks to look back"),
  }),
  func: async ({ weeks }) => {
    const { runsDbId } = getSchema();
    const since = daysAgoISO(weeks * 7);

    const pages = await queryDatabase(
      runsDbId,
      {
        property: "Date",
        date: { on_or_after: since },
      },
      [{ property: "Date", direction: "ascending" }]
    );

    const weekMap = new Map<
      string,
      { total_km: number; run_count: number; long_run_km: number }
    >();

    for (const page of pages as PageObjectResponse[]) {
      const date = getDate(prop(page, "Date"));
      if (!date) continue;
      const week = isoWeek(date);
      const km = getNumber(prop(page, "Distance (km)"));

      const entry = weekMap.get(week) ?? {
        total_km: 0,
        run_count: 0,
        long_run_km: 0,
      };
      entry.total_km += km;
      entry.run_count += 1;
      entry.long_run_km = Math.max(entry.long_run_km, km);
      weekMap.set(week, entry);
    }

    const result = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => ({
        week,
        total_km: Math.round(data.total_km * 100) / 100,
        run_count: data.run_count,
        long_run_km: Math.round(data.long_run_km * 100) / 100,
      }));

    return JSON.stringify(result);
  },
});

const getInjuryFlags = new DynamicStructuredTool({
  name: "get_injury_flags",
  description:
    "Query the Training Log database for all entries where Injury Flag is checked. Returns dates, locations, notes, and energy levels for injury analysis.",
  schema: z.object({}),
  func: async () => {
    const { logDbId } = getSchema();

    const pages = await queryDatabase(
      logDbId,
      {
        property: "Injury Flag",
        checkbox: { equals: true },
      },
      [{ property: "Date", direction: "descending" }]
    );

    const entries = (pages as PageObjectResponse[]).map((page) => ({
      date: getDate(prop(page, "Date")),
      injury_location: getRichText(prop(page, "Injury Location")),
      notes: getRichText(prop(page, "Notes")),
      energy_level: getSelect(prop(page, "Energy Level")),
    }));

    return JSON.stringify(entries);
  },
});

const getUpcomingRaces = new DynamicStructuredTool({
  name: "get_upcoming_races",
  description:
    "Query the Races database for upcoming races sorted by date. Returns race name, date, distance, goal time, and weeks remaining.",
  schema: z.object({}),
  func: async () => {
    const { racesDbId } = getSchema();

    const pages = await queryDatabase(
      racesDbId,
      {
        property: "Status",
        select: { equals: "Upcoming" },
      },
      [{ property: "Date", direction: "ascending" }]
    );

    const now = Date.now();
    const races = (pages as PageObjectResponse[]).map((page) => {
      const dateStr = getDate(prop(page, "Date"));
      const raceDate = new Date(dateStr).getTime();
      const weeksAway = Math.ceil((raceDate - now) / (7 * 24 * 60 * 60 * 1000));

      return {
        name: getTitle(prop(page, "Name")),
        date: dateStr,
        distance: getSelect(prop(page, "Distance")),
        goal_time: getRichText(prop(page, "Goal Time")),
        weeks_away: weeksAway,
      };
    });

    return JSON.stringify(races);
  },
});

const getTrainingLogRange = new DynamicStructuredTool({
  name: "get_training_log_range",
  description:
    "Query the Training Log database for entries between two dates. Returns sleep, energy, injury flags, and notes for each day.",
  schema: z.object({
    start_date: z.string().describe("Start date in ISO format (YYYY-MM-DD)"),
    end_date: z.string().describe("End date in ISO format (YYYY-MM-DD)"),
  }),
  func: async ({ start_date, end_date }) => {
    const { logDbId } = getSchema();

    const pages = await queryDatabase(
      logDbId,
      {
        and: [
          { property: "Date", date: { on_or_after: start_date } },
          { property: "Date", date: { on_or_before: end_date } },
        ],
      },
      [{ property: "Date", direction: "ascending" }]
    );

    const entries = (pages as PageObjectResponse[]).map((page) => ({
      date: getDate(prop(page, "Date")),
      sleep_hrs: getNumber(prop(page, "Sleep (hrs)")),
      energy_level: getSelect(prop(page, "Energy Level")),
      injury_flag: getCheckbox(prop(page, "Injury Flag")),
      injury_location: getRichText(prop(page, "Injury Location")),
      notes: getRichText(prop(page, "Notes")),
    }));

    return JSON.stringify(entries);
  },
});

const addLogEntry = new DynamicStructuredTool({
  name: "add_log_entry",
  description:
    "Create a new entry in the Training Log database. Use this when the runner wants to log sleep, energy, injuries, or daily notes.",
  schema: z.object({
    date: z.string().describe("Entry date in ISO format (YYYY-MM-DD)"),
    sleep_hrs: z.number().describe("Hours of sleep"),
    energy_level: z
      .enum(["High", "Normal", "Low", "Exhausted"])
      .describe("Energy level"),
    injury_flag: z.boolean().describe("Whether the runner has any pain or niggle"),
    injury_location: z
      .string()
      .describe("Body part affected, e.g. 'left knee'. Empty string if no injury"),
    notes: z.string().describe("Free text notes about the day or run"),
  }),
  func: async ({ date, sleep_hrs, energy_level, injury_flag, injury_location, notes }) => {
    const { logDbId } = getSchema();

    await createPage(logDbId, {
      Name: {
        title: [{ text: { content: `Log entry ${date}` } }],
      },
      Date: {
        date: { start: date },
      },
      "Sleep (hrs)": {
        number: sleep_hrs,
      },
      "Energy Level": {
        select: { name: energy_level },
      },
      "Injury Flag": {
        checkbox: injury_flag,
      },
      "Injury Location": {
        rich_text: [{ text: { content: injury_location } }],
      },
      Notes: {
        rich_text: [{ text: { content: notes } }],
      },
    });

    return `Log entry added for ${date}`;
  },
});

const saveCoachingSession = new DynamicStructuredTool({
  name: "save_coaching_session",
  description:
    "Save the current coaching session to Notion. You MUST call this after every response you give, with your full response, the tools you called, and the insight type.",
  schema: z.object({
    question: z.string().describe("The user's original question"),
    response: z.string().describe("Your full coaching response"),
    tools_used: z
      .array(z.string())
      .describe("List of tool names called during this session"),
    insight_type: z
      .enum([
        "Race Readiness",
        "Injury Analysis",
        "Volume Review",
        "Race Planning",
        "General",
      ])
      .describe("The category that best describes this coaching interaction"),
  }),
  func: async ({ question, response, tools_used, insight_type }) => {
    const { sessionsDbId } = getSchema();

    const today = new Date();
    const dateLabel = today.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const isoDate = today.toISOString().split("T")[0];

    // Notion rich_text has a 2000 char limit per block — truncate if needed
    const truncate = (s: string, max = 2000) =>
      s.length > max ? s.slice(0, max - 3) + "..." : s;

    await createPage(sessionsDbId, {
      Name: {
        title: [{ text: { content: `Coaching Session — ${dateLabel}` } }],
      },
      Date: {
        date: { start: isoDate },
      },
      Question: {
        rich_text: [{ text: { content: truncate(question) } }],
      },
      Response: {
        rich_text: [{ text: { content: truncate(response) } }],
      },
      "Tools Used": {
        rich_text: [{ text: { content: tools_used.join(", ") } }],
      },
      "Insight Type": {
        select: { name: insight_type },
      },
    });

    return "Session saved to Notion.";
  },
});

const getCoachingHistory = new DynamicStructuredTool({
  name: "get_coaching_history",
  description:
    "Retrieve past coaching sessions from Notion. Use this when the user references a previous conversation ('last time', 'again', 'still', 'as before') to check for relevant context.",
  schema: z.object({
    limit: z
      .number()
      .default(5)
      .describe("Number of recent sessions to retrieve (default 5)"),
  }),
  func: async ({ limit }) => {
    const { sessionsDbId } = getSchema();

    const pages = await queryDatabase(
      sessionsDbId,
      undefined,
      [{ property: "Date", direction: "descending" }]
    );

    const sessions = (pages as PageObjectResponse[])
      .slice(0, limit)
      .map((page) => {
        const fullResponse = getRichText(prop(page, "Response"));
        return {
          date: getDate(prop(page, "Date")),
          question: getRichText(prop(page, "Question")),
          response_summary: fullResponse.slice(0, 200) + (fullResponse.length > 200 ? "..." : ""),
          insight_type: getSelect(prop(page, "Insight Type")),
          tools_used: getRichText(prop(page, "Tools Used")),
        };
      });

    return JSON.stringify(sessions);
  },
});

export const tools = [
  getRecentRuns,
  getWeeklyMileage,
  getInjuryFlags,
  getUpcomingRaces,
  getTrainingLogRange,
  addLogEntry,
  saveCoachingSession,
  getCoachingHistory,
];
