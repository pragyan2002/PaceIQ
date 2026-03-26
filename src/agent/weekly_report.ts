import { notionClient } from "../notion/client.js";
import { queryDatabase, createPage } from "../notion/client.js";
import { getSchema, getSchemaAsync } from "../notion/schema.js";
import { tools } from "./tools.js";
import type { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints.js";
import "dotenv/config";

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentISOWeek(): string {
  const d = new Date();
  const dayOfYear =
    Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
  const weekDay = d.getDay() || 7;
  const weekNum = Math.ceil((dayOfYear - weekDay + 10) / 7);
  const year =
    weekNum === 1 && d.getMonth() === 11
      ? d.getFullYear() + 1
      : weekNum >= 52 && d.getMonth() === 0
        ? d.getFullYear() - 1
        : d.getFullYear();
  return `W${String(weekNum).padStart(2, "0")}-${year}`;
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

async function invokeTool(name: string, input: Record<string, unknown> = {}): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  const raw = await (tool as { invoke: (i: Record<string, unknown>) => Promise<string> }).invoke(input);
  return JSON.parse(raw as string);
}

// ── Notion Block Helpers ─────────────────────────────────────────────────────

function heading1(text: string): BlockObjectRequest {
  return {
    object: "block" as const,
    type: "heading_1" as const,
    heading_1: { rich_text: [{ type: "text" as const, text: { content: text } }] },
  };
}

function heading2(text: string): BlockObjectRequest {
  return {
    object: "block" as const,
    type: "heading_2" as const,
    heading_2: { rich_text: [{ type: "text" as const, text: { content: text } }] },
  };
}

function heading3(text: string): BlockObjectRequest {
  return {
    object: "block" as const,
    type: "heading_3" as const,
    heading_3: { rich_text: [{ type: "text" as const, text: { content: text } }] },
  };
}

function paragraph(text: string): BlockObjectRequest {
  return {
    object: "block" as const,
    type: "paragraph" as const,
    paragraph: { rich_text: [{ type: "text" as const, text: { content: text } }] },
  };
}

function bullet(text: string): BlockObjectRequest {
  return {
    object: "block" as const,
    type: "bulleted_list_item" as const,
    bulleted_list_item: { rich_text: [{ type: "text" as const, text: { content: text } }] },
  };
}

function numbered(text: string): BlockObjectRequest {
  return {
    object: "block" as const,
    type: "numbered_list_item" as const,
    numbered_list_item: { rich_text: [{ type: "text" as const, text: { content: text } }] },
  };
}

function divider(): BlockObjectRequest {
  return { object: "block" as const, type: "divider" as const, divider: {} };
}

function callout(text: string, emoji: string, color: string): BlockObjectRequest {
  return {
    object: "block" as const,
    type: "callout" as const,
    callout: {
      rich_text: [{ type: "text" as const, text: { content: text } }],
      icon: { type: "emoji" as const, emoji: emoji as "🟢" },
      color: color as "green_background",
    },
  };
}

function codeBlock(content: string, language: string): BlockObjectRequest {
  return {
    object: "block" as const,
    type: "code" as const,
    code: {
      rich_text: [{ type: "text" as const, text: { content: content.slice(0, 2000) } }],
      language: language as "json",
    },
  };
}

// ── Report Generation ────────────────────────────────────────────────────────

interface OvertainingResult {
  risk_level: string;
  weekly_increase_pct: number;
  avg_energy: number;
  injury_flag_count: number;
  consecutive_run_days: number;
  current_weekly_mileage: number;
  reasoning: string;
}

interface PlateauResult {
  plateau_detected: boolean;
  pace_trend_sec_per_km_per_week: number;
  hr_trend_bpm_per_week: number;
  weeks_analysed: number;
  diagnosis: string;
}

interface PRAssessment {
  distance: string;
  ready: string;
  confidence: string;
  blockers: string[];
  supporting_evidence: string[];
}

interface PRResult {
  assessments: PRAssessment[];
}

interface WeeklyMileage {
  week: string;
  total_km: number;
  run_count: number;
  long_run_km: number;
}

export async function generateWeeklyReport(): Promise<{ pageUrl: string; report: Record<string, unknown> }> {
  const weekStr = currentISOWeek();
  const dateStr = formatDate();
  const isoDate = new Date().toISOString().split("T")[0];

  // Run all analysis tools
  const [overtraining, plateau, pr, mileageData, injuries] = await Promise.all([
    invokeTool("detect_overtraining", { weeks: 4 }) as Promise<OvertainingResult>,
    invokeTool("detect_plateau", { weeks: 6 }) as Promise<PlateauResult>,
    invokeTool("assess_pr_readiness", {}) as Promise<PRResult>,
    invokeTool("get_weekly_mileage", { weeks: 4 }) as Promise<WeeklyMileage[]>,
    invokeTool("get_injury_flags", {}) as Promise<Array<{ date: string; injury_location: string; notes: string }>>,
  ]);

  const currentMileage = Array.isArray(mileageData) && mileageData.length > 0
    ? mileageData[mileageData.length - 1].total_km
    : 0;

  // Determine best PR readiness
  const bestPR = pr.assessments.find((a: PRAssessment) => a.ready === "Yes")
    ?? pr.assessments.find((a: PRAssessment) => a.ready === "Maybe")
    ?? pr.assessments[0];

  const prReadySelect = bestPR?.ready === "Yes"
    ? `Yes - ${bestPR.distance}`
    : bestPR?.ready === "Maybe"
      ? "Maybe"
      : "Not Ready";

  // Compose summary
  const summaryParts: string[] = [];
  if (overtraining.weekly_increase_pct > 10) {
    summaryParts.push(`Your mileage jumped ${overtraining.weekly_increase_pct}% this week while average energy is at ${overtraining.avg_energy}/3.0.`);
  } else {
    summaryParts.push(`Weekly mileage is ${Math.round(currentMileage * 10) / 10}km with steady energy levels.`);
  }
  if (plateau.plateau_detected) {
    summaryParts.push(`Pace improvement has stalled over ${plateau.weeks_analysed} weeks despite HR changes — a classic plateau signal.`);
  }
  if (bestPR?.ready === "Yes") {
    summaryParts.push(`You look ready for a ${bestPR.distance} PR attempt.`);
  }

  // Compose recommendations
  const recommendations: string[] = [];
  if (overtraining.risk_level !== "Low") {
    recommendations.push("Take one full rest day before your next run");
  }
  if (overtraining.avg_energy < 2) {
    recommendations.push("Focus on sleep and recovery — your energy trend is declining");
  }
  if (plateau.plateau_detected) {
    recommendations.push("Replace one easy run with tempo intervals to break the plateau");
  }
  if (bestPR?.ready === "Yes") {
    recommendations.push(`Your ${bestPR.distance} PR window is open — consider racing in the next 2 weeks`);
  }
  if (recommendations.length === 0) {
    recommendations.push("Continue current training — your metrics look healthy");
  }
  // Ensure at least 3 recommendations
  while (recommendations.length < 3) {
    recommendations.push("Stay consistent with your current weekly volume");
  }

  // Risk emoji and color mapping
  const riskEmoji: Record<string, string> = {
    Low: "\uD83D\uDFE2", Moderate: "\uD83D\uDFE1", High: "\uD83D\uDD34", Critical: "\uD83D\uDEA8",
  };
  const riskColor: Record<string, string> = {
    Low: "green_background", Moderate: "yellow_background", High: "red_background", Critical: "red_background",
  };

  // Build Notion page blocks
  const children: BlockObjectRequest[] = [
    heading1(`\uD83D\uDCCA Week ${weekStr} Report — ${dateStr}`),

    callout(
      `Overtraining Risk: ${overtraining.risk_level.toUpperCase()}`,
      riskEmoji[overtraining.risk_level] ?? "\uD83D\uDFE2",
      riskColor[overtraining.risk_level] ?? "default",
    ),
    callout(
      `Plateau: ${plateau.plateau_detected ? "DETECTED" : "Not Detected"}`,
      plateau.plateau_detected ? "\uD83D\uDCC9" : "\u2705",
      plateau.plateau_detected ? "yellow_background" : "green_background",
    ),
    callout(
      `PR Readiness: ${prReadySelect}`,
      "\uD83C\uDFC6",
      bestPR?.ready === "Yes" ? "green_background" : "default",
    ),
    callout(
      `Weekly Mileage: ${Math.round(currentMileage * 10) / 10} km`,
      "\uD83D\uDCCF",
      "default",
    ),

    divider(),

    heading2("Weekly Summary"),
    paragraph(summaryParts.join(" ")),

    divider(),

    heading2("\u26A0\uFE0F Overtraining Analysis"),
    paragraph(`Risk Level: ${overtraining.risk_level}`),
    bullet(`Mileage increase: +${overtraining.weekly_increase_pct}% week-over-week (threshold: 10%)`),
    bullet(`Avg energy this week: ${overtraining.avg_energy}/3.0`),
    bullet(`Consecutive run days: ${overtraining.consecutive_run_days}`),
    bullet(`Injury flags: ${overtraining.injury_flag_count}`),

    divider(),

    heading2("\uD83D\uDCC8 Plateau Analysis"),
    paragraph(`Plateau: ${plateau.plateau_detected ? "Detected" : "Not Detected"}`),
    bullet(`Pace trend: ${plateau.pace_trend_sec_per_km_per_week} sec/km/week`),
    bullet(`HR trend: ${plateau.hr_trend_bpm_per_week} bpm/week`),
    bullet(plateau.diagnosis),

    divider(),

    heading2("\uD83C\uDFC6 PR Readiness"),
    ...pr.assessments.map((a: PRAssessment) => {
      const evidence = a.ready === "Yes" || a.ready === "Maybe"
        ? a.supporting_evidence.join(", ")
        : a.blockers.join(", ");
      return bullet(`${a.distance}: ${a.ready} — ${evidence || "insufficient data"}`);
    }),

    divider(),

    heading2("\uD83D\uDCA1 This Week's Recommendations"),
    ...recommendations.slice(0, 3).map((r) => numbered(r)),

    divider(),

    heading3("Raw Metrics"),
    codeBlock(
      JSON.stringify({ overtraining, plateau, pr, mileage: mileageData, recent_injuries: injuries }, null, 2),
      "json",
    ),
  ];

  // Create the Notion page
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  if (!parentPageId) {
    throw new Error("NOTION_PARENT_PAGE_ID is required to create report pages");
  }

  const page = await notionClient.pages.create({
    parent: { type: "page_id", page_id: parentPageId },
    properties: {
      title: {
        title: [{ text: { content: `\uD83D\uDCCA Week ${weekStr} Report — ${dateStr}` } }],
      },
    },
    children,
  });

  const pageUrl = `https://notion.so/${page.id.replace(/-/g, "")}`;

  // Write summary row to Weekly Reports database
  const schema = getSchema();
  if (schema.reportsDbId) {
    await createPage(schema.reportsDbId, {
      Name: {
        title: [{ text: { content: `\uD83D\uDCCA Week ${weekStr} — Report` } }],
      },
      Week: {
        rich_text: [{ text: { content: weekStr } }],
      },
      "Date Generated": {
        date: { start: isoDate },
      },
      "Overtraining Risk": {
        select: { name: overtraining.risk_level },
      },
      "Plateau Detected": {
        checkbox: plateau.plateau_detected,
      },
      "PR Ready": {
        select: { name: prReadySelect },
      },
      "Weekly Mileage": {
        number: Math.round(currentMileage * 100) / 100,
      },
      "Report Page": {
        url: pageUrl,
      },
    });
  }

  const report = { weekStr, overtraining, plateau, pr, mileage: mileageData, recommendations, pageUrl };
  return { pageUrl, report };
}

export async function scheduleWeeklyReport(): Promise<void> {
  const schema = getSchema();
  const weekStr = currentISOWeek();

  // Check if report already exists for this week
  if (schema.reportsDbId) {
    const existing = await queryDatabase(schema.reportsDbId, {
      property: "Week",
      rich_text: { equals: weekStr },
    });

    if (existing.length > 0) {
      console.log(`Weekly report already exists for ${weekStr}`);
      return;
    }
  }

  const { pageUrl } = await generateWeeklyReport();
  console.log(`Weekly report created: ${pageUrl}`);
}

// Allow direct execution via ts-node or GitHub Actions
const isDirectRun = process.argv[1]?.includes("weekly_report");
if (isDirectRun) {
  import("dotenv").then((d) => d.config()).then(async () => {
    try {
      await getSchemaAsync();
      await scheduleWeeklyReport();
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  });
}
