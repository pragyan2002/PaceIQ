import { createPage, notionClient } from "../notion/client.js";
import type { CreatePageParameters } from "@notionhq/client/build/src/api-endpoints.js";
import { getSchemaAsync } from "../notion/schema.js";

export type InsightType =
  | "Race Readiness"
  | "Injury Analysis"
  | "Volume Review"
  | "Race Planning"
  | "General";

export interface ToolCallAudit {
  id?: string;
  name: string;
  args?: unknown;
  node: string;
  timestamp: string;
}

export interface CoachingSessionAudit {
  question: string;
  response: string;
  insightType?: InsightType;
  toolCalls: ToolCallAudit[];
  sessionSource: "server" | "cli" | "agent-tool";
}

let cachedSessionPropertyNames: Set<string> | null = null;

function truncate(s: string, max = 2000): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

export function classifyInsightType(response: string): InsightType {
  const lower = response.toLowerCase();
  if (lower.includes("race") || lower.includes("pr") || lower.includes("personal record")) {
    return "Race Readiness";
  }
  if (lower.includes("injur") || lower.includes("pain") || lower.includes("sore")) {
    return "Injury Analysis";
  }
  if (
    lower.includes("mileage") ||
    lower.includes("volume") ||
    lower.includes("km") ||
    lower.includes("weekly")
  ) {
    return "Volume Review";
  }
  if (
    lower.includes("plan") ||
    lower.includes("training plan") ||
    lower.includes("marathon") ||
    lower.includes("goal")
  ) {
    return "Race Planning";
  }

  return "General";
}

async function getSessionPropertyNames(): Promise<Set<string>> {
  if (cachedSessionPropertyNames) return cachedSessionPropertyNames;

  const { sessionsDbId } = await getSchemaAsync();
  const db = await notionClient.databases.retrieve({ database_id: sessionsDbId });

  cachedSessionPropertyNames = new Set(Object.keys(db.properties ?? {}));
  return cachedSessionPropertyNames;
}

function richText(content: string) {
  return { rich_text: [{ text: { content: truncate(content) } }] };
}

export async function saveCoachingSessionRecord(audit: CoachingSessionAudit): Promise<void> {
  const { sessionsDbId } = await getSchemaAsync();
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const isoDate = today.toISOString().split("T")[0];

  const insightType = audit.insightType ?? classifyInsightType(audit.response);

  const properties: CreatePageParameters["properties"] = {
    Name: {
      title: [{ text: { content: `Coaching Session — ${dateLabel}` } }],
    },
    Date: {
      date: { start: isoDate },
    },
    Question: richText(audit.question),
    Response: richText(audit.response),
    "Tools Used": richText(audit.toolCalls.map((tc) => tc.name).join(", ")),
    "Insight Type": {
      select: { name: insightType },
    },
  };

  // Persist structured audit fields when matching properties exist in Notion schema.
  const availableProps = await getSessionPropertyNames();
  const auditJson = JSON.stringify(
    {
      tool_calls: audit.toolCalls,
      tool_call_count: audit.toolCalls.length,
      session_source: audit.sessionSource,
      captured_at: today.toISOString(),
    },
    null,
    2
  );

  if (availableProps.has("Tool Call Count")) {
    properties["Tool Call Count"] = { number: audit.toolCalls.length };
  }
  if (availableProps.has("Tool Calls")) {
    properties["Tool Calls"] = richText(JSON.stringify(audit.toolCalls));
  }
  if (availableProps.has("Session Source")) {
    properties["Session Source"] = richText(audit.sessionSource);
  }
  if (availableProps.has("Audit Trail")) {
    properties["Audit Trail"] = richText(auditJson);
  }

  await createPage(sessionsDbId, properties);
}
