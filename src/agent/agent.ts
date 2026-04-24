import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tools } from "./tools.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import type { AIMessageChunk } from "@langchain/core/messages";
import type { ToolCallAudit } from "./sessionPersistence.js";
import "dotenv/config";

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is not set. Add it to your .env file.");
}

const model = new ChatOpenAI({
  modelName: "stepfun/step-3.5-flash:free",
  openAIApiKey: process.env.OPENROUTER_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/paceiq",
      "X-Title": "PaceIQ",
    },
  },
});

const agent = createReactAgent({
  llm: model,
  tools,
  prompt: SYSTEM_PROMPT,
});

export interface AskResult {
  response: string;
  toolCalls: ToolCallAudit[];
}

/**
 * Send a question to the PaceIQ agent and return final response + captured tool-call metadata.
 * Prints intermediate tool calls to console so the user can see the agent thinking.
 */
export async function ask(question: string): Promise<AskResult> {
  const stream = await agent.stream(
    { messages: [{ role: "user", content: question }] },
    { streamMode: "updates" }
  );

  let finalResponse = "";
  const toolCalls: ToolCallAudit[] = [];

  for await (const chunk of stream) {
    // Iterate over all node outputs (agent, tools, etc.)
    for (const [nodeName, update] of Object.entries(chunk)) {
      const messages = (update as Record<string, unknown>)?.messages;
      if (!Array.isArray(messages)) continue;

      for (const msg of messages) {
        const aiMsg = msg as AIMessageChunk;

        // Print and capture tool calls from actual runtime events
        if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
          for (const tc of aiMsg.tool_calls) {
            console.log(`  [PaceIQ thinking] → calling ${tc.name}...`);
            toolCalls.push({
              id: tc.id,
              name: tc.name,
              args: tc.args,
              node: nodeName,
              timestamp: new Date().toISOString(),
            });
          }
        }

        // Capture final text response (from agent node, no tool calls)
        if (
          nodeName === "agent" &&
          typeof aiMsg.content === "string" &&
          aiMsg.content.length > 0 &&
          (!aiMsg.tool_calls || aiMsg.tool_calls.length === 0)
        ) {
          finalResponse = aiMsg.content;
        }
      }
    }
  }

  if (!finalResponse) {
    return {
      response: "I wasn't able to generate a response. Please try again.",
      toolCalls,
    };
  }

  return { response: finalResponse, toolCalls };
}
