import { ask } from "../agent/agent.js";
import { syncActivities } from "../strava/sync.js";
import { createApp } from "./app.js";

export const app = createApp({ askFn: ask, syncFn: syncActivities });

export function startServer(): void {
  const PORT = parseInt(process.env.PORT || "3000", 10);
  app.listen(PORT, () => {
    console.log(`PaceIQ running at http://localhost:${PORT}`);
  });
}
