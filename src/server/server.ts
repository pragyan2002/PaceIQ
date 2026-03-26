import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ask } from "../agent/agent.js";
import { syncActivities } from "../strava/sync.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// Serve index.html at root
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Chat endpoint — streams response via SSE
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

// Sync endpoint
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
