import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server/app.js";

test("POST /notion-chat returns 400 for missing question", async () => {
  const app = createApp({ askFn: async () => "unused", syncFn: async () => {} });
  const server = app.listen(0);

  try {
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/notion-chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page_id: "abc" }),
    });

    const body = await response.json();
    assert.equal(response.status, 400);
    assert.deepEqual(body, { error: "Missing or empty question" });
  } finally {
    server.close();
  }
});

test("POST /notion-chat returns contract payload", async () => {
  process.env.NOTION_CHAT_SECRET = "test-secret";
  const app = createApp({ askFn: async () => "Your race PR looks possible.", syncFn: async () => {} });
  const server = app.listen(0);

  try {
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/notion-chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-notion-chat-secret": "test-secret",
      },
      body: JSON.stringify({ question: "Can I race soon?", page_id: "page_123" }),
    });

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      page_id: "page_123",
      response: "Your race PR looks possible.",
      insight_type: "Race Readiness",
    });
  } finally {
    server.close();
    delete process.env.NOTION_CHAT_SECRET;
  }
});
