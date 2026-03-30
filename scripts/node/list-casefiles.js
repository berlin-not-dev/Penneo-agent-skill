/**
 * Penneo — List case files with optional status filter.
 * Handles pagination automatically.
 *
 * Usage:
 *   node list-casefiles.js                       # All case files
 *   node list-casefiles.js --status pending      # Pending only
 *   node list-casefiles.js --status completed    # Completed only
 *   node list-casefiles.js --status rejected     # Rejected only
 *   node list-casefiles.js --status draft        # Drafts only
 *   node list-casefiles.js --status expired      # Expired only
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

const STATUS_LABELS = {
  0: "Draft",
  1: "Pending",
  2: "Rejected",
  3: "Deleted",
  5: "Completed",
  7: "Expired",
};

const STATUS_MAP = {
  draft: 0,
  pending: 1,
  rejected: 2,
  deleted: 3,
  completed: 5,
  expired: 7,
};

const SIGNER_STATUS_LABELS = {
  0: "Request sent",
  1: "Request opened",
  2: "Opened",
  3: "Signed",
  4: "Rejected",
  6: "Undeliverable",
  8: "Finalized",
  9: "Deleted",
};

// --- Parse args ---
const args = process.argv.slice(2);
const statusIdx = args.indexOf("--status");
const statusArg = statusIdx !== -1 ? args[statusIdx + 1]?.toLowerCase() : null;

if (statusArg && !(statusArg in STATUS_MAP)) {
  console.error(`Unknown status '${statusArg}'. Valid options: ${Object.keys(STATUS_MAP).join(", ")}`);
  process.exit(1);
}

// --- Parse Link header ---
function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

// --- Paginate through all results ---
const casefiles = [];
let url = statusArg
  ? `${apiUrl}?status=${STATUS_MAP[statusArg]}`
  : apiUrl;

while (url) {
  const res = await fetch(url, {
    headers: { "X-Auth-Token": ACCESS_TOKEN, "x-paginate": "true" },
  });

  if (!res.ok) {
    console.error(`Failed to fetch case files: ${res.status}`);
    process.exit(1);
  }

  const page = await res.json();
  casefiles.push(...page);
  url = parseNextLink(res.headers.get("link"));
}

// --- Output ---
const label = statusArg ? statusArg.charAt(0).toUpperCase() + statusArg.slice(1) : "All";
console.log(`\n${label} case files (${casefiles.length} found):\n`);

if (!casefiles.length) {
  console.log("  No case files found.");
} else {
  for (const cf of casefiles) {
    const status = STATUS_LABELS[cf.status] ?? `Unknown (${cf.status})`;
    const expire = cf.expireAt
      ? new Date(cf.expireAt * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      : "—";
    console.log(`  [${cf.id}] ${cf.title}  |  ${status}  |  Expires: ${expire}`);
    for (const signer of cf.signers ?? []) {
      const signerStatus = signer.signingRequest?.status;
      const signerLabel = SIGNER_STATUS_LABELS[signerStatus] ?? `Unknown (${signerStatus})`;
      console.log(`    - ${signer.name}: ${signerLabel}`);
    }
  }
}
