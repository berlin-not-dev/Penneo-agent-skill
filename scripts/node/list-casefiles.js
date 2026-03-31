/**
 * Penneo — List case files with flexible filtering.
 * Handles pagination automatically.
 *
 * Usage:
 *   node list-casefiles.js                                          # All case files
 *   node list-casefiles.js --status pending                         # Pending only
 *   node list-casefiles.js --status completed                       # Completed only
 *   node list-casefiles.js --filter createdAfter=1735689600         # Created after date (Unix timestamp)
 *   node list-casefiles.js --filter title=Contract                  # Title contains "Contract"
 *   node list-casefiles.js --filter sort=title                      # Sort alphabetically
 *   node list-casefiles.js --filter sort=-created                   # Sort by newest first
 *   node list-casefiles.js --status pending --filter sort=-created --filter title=NDA
 *
 * Available --filter keys:
 *   title             Match string in title
 *   createdAfter      Unix timestamp — only return cases created after this date
 *   createdBefore     Unix timestamp — only return cases created before this date
 *   completedAfter    Unix timestamp — only return cases completed after this date
 *   completedBefore   Unix timestamp — only return cases completed before this date
 *   activatedAfter    Unix timestamp
 *   activatedBefore   Unix timestamp
 *   expiresAfter      Unix timestamp
 *   expiresBefore     Unix timestamp
 *   updatedAfter      Unix timestamp
 *   updatedBefore     Unix timestamp
 *   sort              Field to sort by. Prepend '-' for descending. E.g. sort=title, sort=-created
 *   ids               Comma-separated case file IDs
 *   folderIds         Comma-separated folder IDs
 *   metaData          Match string in metadata
 *   reference         External reference ID
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

const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const getAllArgs = (flag) => {
  const results = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1]) results.push(args[i + 1]);
  }
  return results;
};

const statusArg = getArg("--status")?.toLowerCase() ?? null;
const filterArgs = getAllArgs("--filter");

if (statusArg && !(statusArg in STATUS_MAP)) {
  console.error(`Unknown status '${statusArg}'. Valid options: ${Object.keys(STATUS_MAP).join(", ")}`);
  process.exit(1);
}

const queryParams = new URLSearchParams();
if (statusArg) queryParams.set("status", STATUS_MAP[statusArg]);

for (const f of filterArgs) {
  const eqIdx = f.indexOf("=");
  if (eqIdx === -1) {
    console.error(`Invalid filter format '${f}'. Expected key=value.`);
    process.exit(1);
  }
  queryParams.set(f.slice(0, eqIdx).trim(), f.slice(eqIdx + 1).trim());
}

// --- Parse Link header ---
function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  if (!match) return null;
  const next = match[1];
  if (next.startsWith("/")) {
    const base = new URL(apiUrl);
    return `${base.protocol}//${base.host}${next}`;
  }
  return next;
}

// --- Paginate through all results ---
const casefiles = [];
const queryString = queryParams.toString();
let url = queryString ? `${apiUrl}?${queryString}` : apiUrl;

while (url) {
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${ACCESS_TOKEN}`, "x-paginate": "true" },
  });

  if (!res.ok) {
    console.error(`Failed to fetch case files: ${res.status}`);
    process.exit(1);
  }

  const page = await res.json();
  casefiles.push(...page);
  url = parseNextLink(res.headers.get("link"));
}

// --- Deduplicate by ID (pagination can overlap) ---
const seen = new Set();
const unique = casefiles.filter((cf) => {
  if (seen.has(cf.id)) return false;
  seen.add(cf.id);
  return true;
});

// --- Output ---
const label = statusArg ? statusArg.charAt(0).toUpperCase() + statusArg.slice(1) : "All";
console.log(`\n${label} case files (${unique.length} found):\n`);

if (!unique.length) {
  console.log("  No case files found.");
} else {
  for (const cf of unique) {
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
