import * as readline from "node:readline";
import { ask } from "./agent/agent.js";
import { syncActivities } from "./strava/sync.js";
import { tools } from "./agent/tools.js";

const BANNER = `
╔═══════════════════════════════════╗
║         PaceIQ — Your AI          ║
║         Running Coach             ║
╚═══════════════════════════════════╝

Your Notion training data is loaded.
Ask me anything about your running.

Examples:
  > How much have I run in the last 4 weeks?
  > Am I ready for my upcoming race?
  > My knee is sore again — has this happened before?
  > Log today: 7hrs sleep, energy high, no injuries

Type /sync to re-import Strava data
Type /history to see past coaching sessions
Type /help to see example questions
Type /quit to exit
`;

const GOODBYE = "Stay consistent. See you tomorrow.";

function printExamples() {
  console.log(`
Examples:
  > How much have I run in the last 4 weeks?
  > Am I ready for my upcoming race?
  > My knee is sore again — has this happened before?
  > Log today: 7hrs sleep, energy high, no injuries
`);
}

export function startCli() {
  console.log(BANNER);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "You > ",
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input === "/quit") {
      console.log(`\n${GOODBYE}`);
      process.exit(0);
    }

    if (input === "/help") {
      printExamples();
      rl.prompt();
      return;
    }

    if (input === "/history") {
      try {
        const historyTool = tools.find((t) => t.name === "get_coaching_history")!;
        const raw = await (historyTool as any).invoke({ limit: 10 });
        const sessions = JSON.parse(raw as string) as Array<{
          date: string;
          question: string;
          response_summary: string;
          insight_type: string;
          tools_used: string;
        }>;
        if (sessions.length === 0) {
          console.log("\nNo coaching sessions saved yet.\n");
        } else {
          console.log(`\n--- Coaching History (${sessions.length} sessions) ---\n`);
          for (const s of sessions) {
            console.log(`[${s.date}] — ${s.insight_type}`);
            console.log(`Q: ${s.question}`);
            console.log(`A: ${s.response_summary}`);
            console.log("---");
          }
          console.log();
        }
      } catch (err) {
        console.error("Failed to load history:", err instanceof Error ? err.message : err);
      }
      rl.prompt();
      return;
    }

    if (input === "/sync") {
      try {
        await syncActivities();
        console.log("Sync complete.\n");
      } catch (err) {
        console.error("Sync failed:", err instanceof Error ? err.message : err);
      }
      rl.prompt();
      return;
    }

    console.log("\nThinking...\n");
    try {
      const response = await ask(input);
      console.log(`\nPaceIQ > ${response}\n`);
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : err);
    }
    rl.prompt();
  });

  rl.on("close", () => {
    console.log(`\n${GOODBYE}`);
    process.exit(0);
  });
}
