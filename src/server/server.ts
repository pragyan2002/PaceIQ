import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ask } from "../agent/agent.js";
import { syncActivities } from "../strava/sync.js";
import { tools } from "../agent/tools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// ── Helper to invoke agent tools by name ────────────────────────────────────

async function invokeTool(name: string, input: Record<string, unknown> = {}): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  const raw = await (tool as { invoke: (i: Record<string, unknown>) => Promise<string> }).invoke(input);
  return JSON.parse(raw as string);
}

// ── Page Routes ─────────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/chat", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/training-log", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "training-log.html"));
});

app.get("/race-planner", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "race-planner.html"));
});

// ── API Endpoints ───────────────────────────────────────────────────────────

app.get("/api/runs", async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const data = await invokeTool("get_recent_runs", { days });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch runs" });
  }
});

app.get("/api/races", async (_req, res) => {
  try {
    const data = await invokeTool("get_upcoming_races", {});
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch races" });
  }
});

app.get("/api/injuries", async (_req, res) => {
  try {
    const data = await invokeTool("get_injury_flags", {});
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch injuries" });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const weeks = parseInt(req.query.weeks as string) || 4;
    const data = await invokeTool("get_weekly_mileage", { weeks });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch stats" });
  }
});

app.get("/api/overtraining", async (_req, res) => {
  try {
    const data = await invokeTool("detect_overtraining", { weeks: 4 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to analyze" });
  }
});

app.get("/api/pr-readiness", async (_req, res) => {
  try {
    const data = await invokeTool("assess_pr_readiness", {});
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to assess" });
  }
});

// ── Chat SSE Endpoint ───────────────────────────────────────────────────────

app.post("/chat", async (req, res) => {
  const { question } = req.body as { question: string };
  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "Missing question" });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    // Override console.log temporarily to capture tool call messages
    const originalLog = console.log;
    const toolCalls: string[] = [];

    console.log = (...args: unknown[]) => {
      const msg = args.map(String).join(" ");
      if (msg.includes("[PaceIQ thinking]")) {
        toolCalls.push(msg.trim());
        res.write(`data: ${JSON.stringify({ tool_call: msg.trim() })}\n\n`);
      }
      originalLog.apply(console, args);
    };

    const response = await ask(question);
    console.log = originalLog;

    // Stream the response token by token for typewriter effect
    const words = response.split(" ");
    for (let i = 0; i < words.length; i++) {
      const token = i === 0 ? words[i] : " " + words[i];
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
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

export function startServer(): void {
  const PORT = parseInt(process.env.PORT || "3000", 10);
  app.listen(PORT, () => {
    console.log(`PaceIQ running at http://localhost:${PORT}`);
  });
}
