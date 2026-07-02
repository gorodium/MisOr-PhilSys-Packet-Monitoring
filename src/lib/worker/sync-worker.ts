import { runAutomation } from "@/lib/automation";
import { runFullSync } from "@/lib/matching";
import { getResolvedSettings } from "@/lib/settings";

let running = false;

async function tick() {
  if (running) {
    return;
  }

  running = true;
  try {
    await runFullSync();
    await runAutomation({ mode: "auto" });
  } catch (error) {
    console.error("Background sync failed", error);
  } finally {
    running = false;
  }
}

async function main() {
  const settings = await getResolvedSettings();
  const intervalMs = Math.max(settings.syncIntervalSeconds, 60) * 1000;

  await tick();
  setInterval(tick, intervalMs);
  console.log(`PhilSys worker started with ${intervalMs / 1000}s interval.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

