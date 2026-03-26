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

// ── Analysis Tools ──────────────────────────────────────────────────────────

const detectOvertraining = new DynamicStructuredTool({
  name: "detect_overtraining",
  description:
    "Analyze training data for overtraining risk. Checks mileage increase %, energy trends, injury frequency, and consecutive run days. Returns a risk level (Low/Moderate/High/Critical) with reasoning.",
  schema: z.object({
    weeks: z.number().default(4).describe("Number of weeks to analyze (default 4)"),
  }),
  func: async ({ weeks }) => {
    const { runsDbId, logDbId } = getSchema();
    const since = daysAgoISO(weeks * 7);

    // Fetch runs
    const runPages = await queryDatabase(
      runsDbId,
      { property: "Date", date: { on_or_after: since } },
      [{ property: "Date", direction: "ascending" }]
    );

    // Fetch training log entries
    const logPages = await queryDatabase(
      logDbId,
      { property: "Date", date: { on_or_after: since } },
      [{ property: "Date", direction: "ascending" }]
    );

    // Group runs by week for mileage
    const weekMap = new Map<string, number>();
    const runDates: string[] = [];
    for (const page of runPages as PageObjectResponse[]) {
      const date = getDate(prop(page, "Date"));
      if (!date) continue;
      runDates.push(date);
      const week = isoWeek(date);
      const km = getNumber(prop(page, "Distance (km)"));
      weekMap.set(week, (weekMap.get(week) ?? 0) + km);
    }

    // Week-over-week mileage increase
    const weeklyTotals = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, km]) => km);

    let weeklyIncreasePct = 0;
    if (weeklyTotals.length >= 2) {
      const prev = weeklyTotals[weeklyTotals.length - 2];
      const curr = weeklyTotals[weeklyTotals.length - 1];
      weeklyIncreasePct = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0;
    }

    // Energy trend
    const energyMap: Record<string, number> = {
      High: 3, Normal: 2, Low: 1, Exhausted: 0,
    };
    let energySum = 0;
    let energyCount = 0;
    let injuryFlagCount = 0;

    for (const page of logPages as PageObjectResponse[]) {
      const energy = getSelect(prop(page, "Energy Level"));
      if (energy && energy in energyMap) {
        energySum += energyMap[energy];
        energyCount++;
      }
      if (getCheckbox(prop(page, "Injury Flag"))) {
        injuryFlagCount++;
      }
    }

    const avgEnergy = energyCount > 0 ? Math.round((energySum / energyCount) * 10) / 10 : 2;

    // Consecutive run days
    const uniqueDates = [...new Set(runDates)].sort();
    let maxConsecutive = 0;
    let currentStreak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const prev = new Date(uniqueDates[i - 1]);
      const curr = new Date(uniqueDates[i]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      if (diffDays === 1) {
        currentStreak++;
        maxConsecutive = Math.max(maxConsecutive, currentStreak);
      } else {
        currentStreak = 1;
      }
    }
    maxConsecutive = Math.max(maxConsecutive, currentStreak);

    // Score risk
    let riskLevel: string;
    const reasons: string[] = [];

    if (weeklyIncreasePct > 30 || maxConsecutive > 7 || injuryFlagCount >= 2) {
      riskLevel = "Critical";
    } else if (weeklyIncreasePct > 20 || avgEnergy < 1.5 || maxConsecutive > 5) {
      riskLevel = "High";
    } else if (weeklyIncreasePct > 10 || avgEnergy < 2.0) {
      riskLevel = "Moderate";
    } else {
      riskLevel = "Low";
    }

    if (weeklyIncreasePct > 10) reasons.push(`Mileage increase: +${weeklyIncreasePct}% week-over-week (threshold: 10%)`);
    reasons.push(`Avg energy: ${avgEnergy}/3.0`);
    reasons.push(`Consecutive run days: ${maxConsecutive}`);
    reasons.push(`Injury flags in period: ${injuryFlagCount}`);

    return JSON.stringify({
      risk_level: riskLevel,
      weekly_increase_pct: weeklyIncreasePct,
      avg_energy: avgEnergy,
      injury_flag_count: injuryFlagCount,
      consecutive_run_days: maxConsecutive,
      current_weekly_mileage: weeklyTotals.length > 0 ? Math.round(weeklyTotals[weeklyTotals.length - 1] * 100) / 100 : 0,
      reasoning: reasons.join("; "),
    });
  },
});

const detectPlateau = new DynamicStructuredTool({
  name: "detect_plateau",
  description:
    "Analyze pace and heart rate trends to detect performance plateaus. Uses linear regression on weekly averages. Returns plateau detection with diagnosis.",
  schema: z.object({
    weeks: z.number().default(6).describe("Number of weeks to analyze (default 6)"),
  }),
  func: async ({ weeks }) => {
    const { runsDbId } = getSchema();
    const since = daysAgoISO(weeks * 7);

    const runPages = await queryDatabase(
      runsDbId,
      { property: "Date", date: { on_or_after: since } },
      [{ property: "Date", direction: "ascending" }]
    );

    // Group by week: avg pace and avg HR
    const weekData = new Map<string, { paces: number[]; hrs: number[] }>();

    for (const page of runPages as PageObjectResponse[]) {
      const date = getDate(prop(page, "Date"));
      if (!date) continue;
      const week = isoWeek(date);
      const pace = getNumber(prop(page, "Avg Pace (min/km)"));
      const hr = getNumber(prop(page, "Avg Heart Rate"));

      if (!weekData.has(week)) weekData.set(week, { paces: [], hrs: [] });
      const entry = weekData.get(week)!;
      if (pace > 0) entry.paces.push(pace);
      if (hr > 0) entry.hrs.push(hr);
    }

    const sortedWeeks = Array.from(weekData.entries())
      .sort(([a], [b]) => a.localeCompare(b));

    const weeklyPaces: number[] = [];
    const weeklyHRs: number[] = [];

    for (const [, data] of sortedWeeks) {
      const avgPace = data.paces.length > 0
        ? data.paces.reduce((a, b) => a + b, 0) / data.paces.length
        : 0;
      const avgHR = data.hrs.length > 0
        ? data.hrs.reduce((a, b) => a + b, 0) / data.hrs.length
        : 0;
      weeklyPaces.push(avgPace);
      weeklyHRs.push(avgHR);
    }

    // Simple least-squares linear regression slope
    function linearSlope(values: number[]): number {
      const n = values.length;
      if (n < 2) return 0;
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumXX += i * i;
      }
      const denom = n * sumXX - sumX * sumX;
      return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    }

    const paceSlope = linearSlope(weeklyPaces); // min/km per week (negative = improving)
    const hrSlope = linearSlope(weeklyHRs); // bpm per week

    // Convert pace slope to sec/km per week for readability
    const paceSlopeSec = Math.round(paceSlope * 60 * 10) / 10;
    const hrSlopeRound = Math.round(hrSlope * 10) / 10;

    // Plateau detection
    let plateauDetected = false;
    let diagnosis = "";

    const paceImprovement = -paceSlopeSec; // positive = getting faster

    if (paceImprovement < 0.5 && sortedWeeks.length >= 4) {
      plateauDetected = true;
      if (hrSlopeRound > 0) {
        diagnosis = `Pace stagnating (${paceImprovement.toFixed(1)} sec/km improvement over ${sortedWeeks.length} weeks) while avg HR rising (+${hrSlopeRound} bpm/week) — reduce intensity, add one easy week`;
      } else {
        diagnosis = `Both pace and HR trending flat for ${sortedWeeks.length} weeks — consider adding variety: tempo runs, intervals, or hill work`;
      }
    } else {
      diagnosis = `Pace improving at ${paceImprovement.toFixed(1)} sec/km per week — no plateau detected`;
    }

    return JSON.stringify({
      plateau_detected: plateauDetected,
      pace_trend_sec_per_km_per_week: paceSlopeSec,
      hr_trend_bpm_per_week: hrSlopeRound,
      weeks_analysed: sortedWeeks.length,
      diagnosis,
    });
  },
});

const assessPrReadiness = new DynamicStructuredTool({
  name: "assess_pr_readiness",
  description:
    "Assess readiness for personal record attempts at 5K, 10K, and Half Marathon distances. Checks mileage consistency, long runs, injury status, and energy levels.",
  schema: z.object({}),
  func: async () => {
    const { runsDbId, logDbId } = getSchema();
    const since8w = daysAgoISO(56); // 8 weeks
    const since2w = daysAgoISO(14);
    const since3w = daysAgoISO(21);

    // Fetch runs (8 weeks)
    const runPages = await queryDatabase(
      runsDbId,
      { property: "Date", date: { on_or_after: since8w } },
      [{ property: "Date", direction: "ascending" }]
    );

    // Fetch recent injuries (3 weeks)
    const injuryPages = await queryDatabase(
      logDbId,
      {
        and: [
          { property: "Date", date: { on_or_after: since3w } },
          { property: "Injury Flag", checkbox: { equals: true } },
        ],
      }
    );

    // Fetch recent energy (2 weeks)
    const energyPages = await queryDatabase(
      logDbId,
      { property: "Date", date: { on_or_after: since2w } },
      [{ property: "Date", direction: "descending" }]
    );

    // Group runs by week
    const weekMap = new Map<string, { total_km: number; long_run_km: number; has_tempo: boolean }>();
    for (const page of runPages as PageObjectResponse[]) {
      const date = getDate(prop(page, "Date"));
      if (!date) continue;
      const week = isoWeek(date);
      const km = getNumber(prop(page, "Distance (km)"));
      const runType = getSelect(prop(page, "Run Type"));

      if (!weekMap.has(week)) weekMap.set(week, { total_km: 0, long_run_km: 0, has_tempo: false });
      const entry = weekMap.get(week)!;
      entry.total_km += km;
      entry.long_run_km = Math.max(entry.long_run_km, km);
      if (runType === "Tempo" || runType === "Interval") entry.has_tempo = true;
    }

    const sortedWeeks = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b));

    const weeklyKms = sortedWeeks.map(([, d]) => d.total_km);
    const maxLongRun = Math.max(...sortedWeeks.map(([, d]) => d.long_run_km), 0);

    // Injuries in last 2 weeks
    const recentInjuries2w = (injuryPages as PageObjectResponse[]).filter((p) => {
      const d = getDate(prop(p, "Date"));
      return d >= since2w;
    }).length;

    const recentInjuries3w = injuryPages.length;

    // Average energy last 2 weeks
    const energyMap: Record<string, number> = { High: 3, Normal: 2, Low: 1, Exhausted: 0 };
    let energySum = 0;
    let energyCount = 0;
    for (const page of energyPages as PageObjectResponse[]) {
      const energy = getSelect(prop(page, "Energy Level"));
      if (energy && energy in energyMap) {
        energySum += energyMap[energy];
        energyCount++;
      }
    }
    const avgEnergy = energyCount > 0 ? energySum / energyCount : 2;

    // Count consecutive weeks at mileage thresholds
    function consecutiveWeeksAbove(threshold: number): number {
      let max = 0;
      let current = 0;
      for (const km of weeklyKms) {
        if (km >= threshold) {
          current++;
          max = Math.max(max, current);
        } else {
          current = 0;
        }
      }
      return max;
    }

    const assessments = [];

    // 5K assessment
    const has5kEffort = sortedWeeks.some(([, d]) => d.has_tempo);
    const weeks25 = consecutiveWeeksAbove(25);
    const ready5k = has5kEffort && weeks25 >= 3 && recentInjuries2w === 0 && avgEnergy >= 2;
    assessments.push({
      distance: "5K",
      ready: ready5k ? "Yes" : weeks25 >= 2 ? "Maybe" : "Not Ready",
      confidence: ready5k ? "High" : "Low",
      blockers: [
        ...(!has5kEffort ? ["No recent tempo/interval work"] : []),
        ...(weeks25 < 3 ? [`Only ${weeks25} consecutive weeks at 25km+`] : []),
        ...(recentInjuries2w > 0 ? [`${recentInjuries2w} injury flags in last 2 weeks`] : []),
        ...(avgEnergy < 2 ? ["Energy below Normal"] : []),
      ],
      supporting_evidence: [
        ...(has5kEffort ? ["Recent tempo/interval sessions"] : []),
        ...(weeks25 >= 3 ? [`${weeks25} weeks at 25km+`] : []),
        ...(recentInjuries2w === 0 ? ["No recent injuries"] : []),
      ],
    });

    // 10K assessment
    const weeks40 = consecutiveWeeksAbove(40);
    const hasLong10k = sortedWeeks.slice(-3).some(([, d]) => d.long_run_km >= 8);
    const ready10k = hasLong10k && weeks40 >= 3 && recentInjuries2w === 0;
    assessments.push({
      distance: "10K",
      ready: ready10k ? "Yes" : (weeks40 >= 2 && hasLong10k) ? "Maybe" : "Not Ready",
      confidence: ready10k ? "High" : "Medium",
      blockers: [
        ...(!hasLong10k ? ["No 8-12km run in last 3 weeks"] : []),
        ...(weeks40 < 3 ? [`Only ${weeks40} consecutive weeks at 40km+`] : []),
        ...(recentInjuries2w > 0 ? [`${recentInjuries2w} injury flags in last 2 weeks`] : []),
      ],
      supporting_evidence: [
        ...(hasLong10k ? ["Recent 8km+ run"] : []),
        ...(weeks40 >= 3 ? [`${weeks40} weeks at 40km+`] : []),
        ...(recentInjuries2w === 0 ? ["No recent injuries"] : []),
      ],
    });

    // Half Marathon assessment
    const weeks50 = consecutiveWeeksAbove(50);
    const hasLong16 = maxLongRun >= 16;
    const readyHalf = hasLong16 && weeks50 >= 4 && recentInjuries3w === 0;
    assessments.push({
      distance: "Half Marathon",
      ready: readyHalf ? "Yes" : (hasLong16 && weeks50 >= 2) ? "Maybe" : "Not Ready",
      confidence: readyHalf ? "High" : "Low",
      blockers: [
        ...(!hasLong16 ? [`Long run peaked at ${Math.round(maxLongRun)}km (need 16km+)`] : []),
        ...(weeks50 < 4 ? [`Only ${weeks50} consecutive weeks at 50km+`] : []),
        ...(recentInjuries3w > 0 ? [`${recentInjuries3w} injury flags in last 3 weeks`] : []),
      ],
      supporting_evidence: [
        ...(hasLong16 ? [`Long run: ${Math.round(maxLongRun)}km`] : []),
        ...(weeks50 >= 4 ? [`${weeks50} weeks at 50km+`] : []),
        ...(recentInjuries3w === 0 ? ["No injuries in 3 weeks"] : []),
      ],
    });

    return JSON.stringify({ assessments });
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
  detectOvertraining,
  detectPlateau,
  assessPrReadiness,
];
