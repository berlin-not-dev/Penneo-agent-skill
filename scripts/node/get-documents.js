/**
 * Penneo — Download signed documents from a case file.
 *
 * Fetches document IDs from the case file details, then downloads
 * each document's content via the v3 documents endpoint.
 *
 * Usage:
 *   node get-documents.js --casefile-id 1262730
 *   node get-documents.js --casefile-id 1262730 --format json
 *   node get-documents.js --casefile-id 1262730 --output-dir ./downloads
 *
 * Requires: ACCESS_TOKEN in environment variables (from authenticate.js).
 * Environment: Set PENNEO_ENV=production for production, defaults to sandbox.
 */

import fs from "fs";
import path from "path";
import "dotenv/config";

const ENV = process.env.PENNEO_ENV === "production" ? "production" : "sandbox";

const CONFIG = {
  sandbox: {
    casefilesUrl: "https://sandbox.penneo.com/api/v1/casefiles",
    documentsUrl: "https://sandbox.penneo.com/api/v3/documents",
  },
  production: {
    casefilesUrl: "https://app.penneo.com/api/v1/casefiles",
    documentsUrl: "https://app.penneo.com/api/v3/documents",
  },
};

const { casefilesUrl, documentsUrl } = CONFIG[ENV];
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error("Error: ACCESS_TOKEN must be set. Run authenticate.js first.");
  process.exit(1);
}

// --- Parse args ---
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const caseFileId = getArg("--casefile-id");
const format = (getArg("--format") ?? "pdf").toLowerCase();
const outputDir = getArg("--output-dir") ?? ".";

if (!caseFileId) {
  console.error("Usage: node get-documents.js --casefile-id <id> [--format pdf|json] [--output-dir <path>]");
  process.exit(1);
}

if (!["pdf", "json"].includes(format)) {
  console.error('Error: --format must be "pdf" or "json".');
  process.exit(1);
}

// --- Fetch casefile details to get document IDs ---
const caseRes = await fetch(`${casefilesUrl}/${caseFileId}`, {
  headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` },
});

if (!caseRes.ok) {
  console.error(`Failed to fetch case file: ${caseRes.status}`);
  process.exit(1);
}

const caseFile = await caseRes.json();
const documents = caseFile.documents ?? [];

if (!documents.length) {
  console.log("No documents found in this case file.");
  process.exit(0);
}

console.log(`\nFound ${documents.length} document(s) in "${caseFile.title}". Downloading...`);

// --- Ensure output directory exists ---
fs.mkdirSync(outputDir, { recursive: true });

// --- Download each document ---
const contentType = format === "pdf" ? "application/pdf" : "application/json";
const ext = format === "pdf" ? ".pdf" : ".json";

for (const doc of documents) {
  const docRes = await fetch(`${documentsUrl}/${doc.id}/content`, {
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Accept": contentType,
    },
  });

  if (!docRes.ok) {
    console.error(`  Failed to download "${doc.title}" (ID: ${doc.id}): ${docRes.status}`);
    continue;
  }

  const safeName = doc.title.replace(/[^a-z0-9_\-]/gi, "_");
  const filepath = path.join(outputDir, `${safeName}${ext}`);
  fs.writeFileSync(filepath, Buffer.from(await docRes.arrayBuffer()));
  console.log(`  Saved: ${filepath}`);
}

console.log("\nDone.");