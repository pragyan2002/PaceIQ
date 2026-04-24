import express from "express";
import cors from "cors";
import { classifyInsightType } from "../agent/toolTransforms.js";

export function createApp(deps: {
  askFn: (question: string) => Promise<string>;
  syncFn: () => Promise<void>;
}): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "paceiq-server" });
  });

  app.post("/sync", async (_req, res) => {
    try {
      await deps.syncFn();
      res.json({ success: true, message: "Sync complete" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      res.status(500).json({ success: false, message });
    }
  });

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
      const response = await deps.askFn(question.trim());
      const insight_type = classifyInsightType(response);
      res.json({ ok: true, response, insight_type, page_id });
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

  return app;
}
