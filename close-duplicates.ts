process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { prisma } from "./src/lib/prisma";
import { getStoredSettings } from "./src/lib/settings";

async function run() {
  const stored = await getStoredSettings();
  const matrixBaseUrl = stored.get("matrixBaseUrl")?.value || process.env.MATRIX_BASE_URL || "";
  const matrixApiKey = stored.get("matrixApiKey")?.value || process.env.MATRIX_API_KEY || "";

  if (!matrixBaseUrl || !matrixApiKey) {
    console.error("Missing Matrix configuration");
    return;
  }

  // Find all REFILE activities
  const refiles = await prisma.activityLog.findMany({
    where: { type: "REFILE" },
    orderBy: { createdAt: "desc" }
  });

  const trnToTickets = new Map<string, string[]>();

  for (const refile of refiles) {
    const trn = refile.metadata?.trn;
    const ticketNum = refile.metadata?.ticketNumber;
    if (trn && ticketNum) {
      if (!trnToTickets.has(trn)) trnToTickets.set(trn, []);
      trnToTickets.get(trn)!.push(ticketNum);
    }
  }

  let totalClosed = 0;

  for (const [trn, tickets] of trnToTickets.entries()) {
    if (tickets.length > 1) {
      // The array is ordered descending by createdAt because of the findMany orderBy
      // So tickets[0] is the LATEST one. We keep tickets[0] and cancel the rest.
      const toCancel = tickets.slice(1);
      console.log(`TRN ${trn} has ${tickets.length} tickets. Cancelling ${toCancel.length} older tickets: ${toCancel.join(", ")}...`);

      for (const ticket of toCancel) {
        try {
          const res = await fetch(`${matrixBaseUrl}/issues/${ticket}.json`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Redmine-API-Key": matrixApiKey
            },
            body: JSON.stringify({
              issue: {
                status_id: 8, // Cancelled
                notes: "System Auto-Note: Closing duplicate ticket created from multiple refiles. A newer ticket exists."
              }
            })
          });

          if (res.ok) {
            console.log(`  Successfully cancelled ticket ${ticket}`);
            totalClosed++;
          } else {
            console.log(`  Failed to cancel ticket ${ticket}: ${res.status} ${await res.text()}`);
          }
        } catch (e) {
          console.error(`  Error cancelling ticket ${ticket}:`, e);
        }
      }
    }
  }

  console.log(`\nFinished. Closed ${totalClosed} duplicate tickets.`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
