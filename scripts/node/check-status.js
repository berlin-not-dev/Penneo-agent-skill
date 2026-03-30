/**
 * Penneo — Check the status of a case file.
 *
 * Usage:
 *   node check-status.js --casefile-id 1262730
 *
 * Requires: ACCESS_TOKEN in environment variables (from authenticate.js).
 * Environment: Set PENNEO_ENV=production for production, defaults to sandbox.
 */

import "dotenv/config";

const ENV = process.env.PENNEO_ENV === "production" ? "production" : "sandbox";

const CONFIG = {
  sandbox: { apiUrl: "https://sandbox.penneo.com/api/v1/casefiles" },
  production: { apiUrl: "https://app.penneo.com/api/v1/casefiles" },
};

const { apiUrl } = CONFIG[ENV];
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error("Error: ACCESS_TOKEN must be set. Run authenticate.js first.");
  process.exit(1);
}

const STATUSES = {
  0: "Draft",
  1: "Pending — waiting for signatures",
  2: "Rejected",
  3: "Deleted",
  5: "Completed",
  7: "Expired",
};

const args = process.argv.slice(2);
const idIndex = args.indexOf("--casefile-id");
const caseFileId = idIndex !== -1 ? args[idIndex + 1] : null;

if (!caseFileId) {
  console.error("Usage: node check-status.js --casefile-id <id>");
  process.exit(1);
}

const res = await fetch(`${apiUrl}/${caseFileId}`, {
  headers: { "X-Auth-Token": ACCESS_TOKEN },
});

if (!res.ok) {
  console.error(`Failed to fetch case file: ${res.status}`);
  process.exit(1);
}

const data = await res.json();

const statusLabel = STATUSES[data.status] ?? `Unknown (${data.status})`;
console.log(`\nCase File: ${data.title}`);
console.log(`Status: ${statusLabel}`);

if (data.signers?.length) {
  console.log("\nSigners:");
  for (const signer of data.signers) {
    const signed = data.documents?.some((doc) =>
      doc.signatureLines?.some(
        (sl) => sl.signerId === signer.id && sl.signedAt
      )
    );
    console.log(`  ${signer.name}: ${signed ? "Signed" : "Awaiting signature"}`);
  }
}
