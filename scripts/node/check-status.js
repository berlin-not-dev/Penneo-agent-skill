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

const SIGNER_STATUSES = {
  0: "Request sent",
  1: "Request opened",
  2: "Opened",
  3: "Signed",
  4: "Rejected",
  6: "Undeliverable",
  8: "Finalized",
  9: "Deleted",
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

const caseStatus = STATUSES[data.status] ?? `Unknown (${data.status})`;
const expire = data.expireAt
  ? new Date(data.expireAt * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  : "—";

console.log(`\nCase File: ${data.title}`);
console.log(`Status: ${caseStatus}`);
console.log(`Expires: ${expire}`);

if (data.signers?.length) {
  console.log("\nSigners:");
  for (const signer of data.signers) {
    const signerStatus = signer.signingRequest?.status;
    const signerStatusLabel = SIGNER_STATUSES[signerStatus] ?? `Unknown (${signerStatus})`;
    console.log(`  ${signer.name}: ${signerStatusLabel}`);
  }
}
