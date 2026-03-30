/**
 * Penneo — Send documents for signing (single endpoint casefile creation)
 * Accepts multiple documents and signers via command line arguments.
 *
 * Usage:
 *   node send-for-signing.js \
 *     --title "Contract Agreement" \
 *     --files "./contract.pdf" "./appendix.pdf" \
 *     --signers "Jane Doe:jane@example.com" "John Smith:john@example.com" \
 *     --sequential
 *
 * Requires: ACCESS_TOKEN in environment variables (from authenticate.js).
 * Environment: Set PENNEO_ENV=production for production, defaults to sandbox.
 */

import fs from "fs";
import path from "path";
import FormData from "form-data";
import "dotenv/config";

const ENV = process.env.PENNEO_ENV === "production" ? "production" : "sandbox";

const CONFIG = {
  sandbox: {
    createUrl: "https://sandbox.penneo.com/send/api/v1/casefiles/20251022/create",
    statusUrl: "https://sandbox.penneo.com/send/api/v1/queue/public/status",
  },
  production: {
    createUrl: "https://app.penneo.com/send/api/v1/casefiles/20251022/create",
    statusUrl: "https://app.penneo.com/send/api/v1/queue/public/status",
  },
};

const { createUrl, statusUrl } = CONFIG[ENV];
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error("Error: ACCESS_TOKEN must be set. Run authenticate.js first.");
  process.exit(1);
}

// --- Parse arguments ---
const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  if (i === -1) return [];
  const vals = [];
  for (let j = i + 1; j < args.length && !args[j].startsWith("--"); j++) vals.push(args[j]);
  return vals;
};

const title = get("--title")[0];
const files = get("--files");
const signerArgs = get("--signers");
const sequential = args.includes("--sequential");

if (!title || !files.length || !signerArgs.length) {
  console.error("Usage: node send-for-signing.js --title <title> --files <file1> [file2] --signers \"Name:email\" [\"Name2:email2\"] [--sequential]");
  process.exit(1);
}

// --- Validate files ---
for (const f of files) {
  if (!fs.existsSync(path.resolve(f))) {
    console.error(`Error: File not found: ${f}`);
    process.exit(1);
  }
}

// --- Parse signers ---
const signers = signerArgs.map((s, i) => {
  const colonIdx = s.indexOf(":");
  const name = colonIdx !== -1 ? s.slice(0, colonIdx) : "";
  const email = colonIdx !== -1 ? s.slice(colonIdx + 1) : "";
  if (!name || !email) {
    console.error(`Error: Invalid signer format "${s}". Expected "Full Name:email@example.com"`);
    process.exit(1);
  }
  return { name, email, role: "signer", ...(sequential ? { signOrder: i } : {}) };
});

// --- Build case file data ---
const documents = files.map((f) => ({
  title: path.basename(f, path.extname(f)),
  name: path.basename(f),
}));

const caseFileData = { caseFile: { title, signers, documents } };

// --- Build multipart/form-data request ---
const form = new FormData();
form.append("data", JSON.stringify(caseFileData));
for (const f of files) {
  const resolved = path.resolve(f);
  form.append("files", fs.createReadStream(resolved), {
    filename: path.basename(f),
    contentType: "application/pdf",
  });
}

console.log(`\nSubmitting "${title}" for signing (${ENV})...`);

const createRes = await fetch(createUrl, {
  method: "POST",
  headers: { "X-Auth-Token": ACCESS_TOKEN, ...form.getHeaders() },
  body: form,
});

if (!createRes.ok) {
  const err = await createRes.json();
  console.error("Case file creation failed:", err);
  process.exit(1);
}

const { jobs } = await createRes.json();
const { uuid, payloadHash } = jobs[0];
console.log(`Job queued. Waiting for confirmation...`);

// --- Poll for job status ---
const MAX_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 3000;

for (let i = 0; i < MAX_ATTEMPTS; i++) {
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

  const statusRes = await fetch(statusUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid, payloadHash }),
  });

  if (!statusRes.ok) {
    console.error("Status check failed:", await statusRes.text());
    process.exit(1);
  }

  const job = await statusRes.json();

  if (job.jobStatus === "completed") {
    console.log(`\nDocument successfully sent for signing!`);
    console.log(`Case File ID: ${job.result.data.caseFile.id}`);
    console.log("\nSigning links:");
    for (const s of job.result.data.signingLinks) {
      console.log(`  ${s.name} (${s.role}): ${s.signingLink}`);
    }
    break;
  } else if (job.jobStatus === "failed") {
    console.error("Job failed:", job.errorMessage);
    process.exit(1);
  } else if (job.jobStatus === "aborted_duplicated") {
    console.error("Job aborted — duplicate submission detected.");
    process.exit(1);
  }

  if (i === MAX_ATTEMPTS - 1) {
    console.error("Timed out waiting for job to complete.");
    process.exit(1);
  }
}
