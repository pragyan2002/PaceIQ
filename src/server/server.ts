import { ask } from "../agent/agent.js";
import { classifyInsightType, saveCoachingSessionRecord } from "../agent/sessionPersistence.js";
import { syncActivities } from "../strava/sync.js";
import { createApp } from "./app.js";

const app = express();
app.use(cors());
app.use(express.json());

// ── Health Endpoint ─────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "paceiq-server" });
});

// ── Sync Endpoint ───────────────────────────────────────────────────────────

app.post("/sync", async (_req, res) => {
  try {
    await syncActivities();
    res.json({ success: true, message: "Sync complete" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    res.status(500).json({ success: false, message });
  }
});

// ── Notion Chat Endpoint (called by n8n) ─────────────────────────────────────
app.post("/notion-chat", async (req, res) => {
  const secret = process.env.NOTION_CHAT_SECRET;
  if (secret && req.headers["x-notion-chat-secret"] !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { question, page_id } = req.body as { question?: string; page_id?: string };

  if (!question || typeof question !== "string" || question.trim().length === 0) {
    res.status(400).json({ error: "Missing or empty question" });
    return;
  }

  console.log(`[Notion Chat] page=${page_id} question="${question.slice(0, 80)}"`);

  try {
    const result = await ask(question.trim());
    const insight_type = classifyInsightType(result.response);

    await saveCoachingSessionRecord({
      question: question.trim(),
      response: result.response,
      insightType: insight_type,
      toolCalls: result.toolCalls,
      sessionSource: "server",
    });

    res.json({ ok: true, response: result.response, insight_type, page_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Notion Chat] Error: ${message}`);
    res.status(500).json({
      ok: false,
      error: message,
      response: `Sorry, I hit an error: ${message}. Check the PaceIQ server logs.`,
      insight_type: "General",
    });
  }
});

export function startServer(): void {
  const PORT = parseInt(process.env.PORT || "3000", 10);
  app.listen(PORT, () => {
    console.log(`PaceIQ running at http://localhost:${PORT}`);
  });
}
