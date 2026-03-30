"""
Penneo — Send documents for signing (single endpoint casefile creation)
Accepts multiple documents and signers via command line arguments.

Usage:
  python send-for-signing.py \
    --title "Contract Agreement" \
    --files "./contract.pdf" "./appendix.pdf" \
    --signers "Jane Doe:jane@example.com" "John Smith:john@example.com" \
    --sequential

Requires: ACCESS_TOKEN in environment variables (from authenticate.py).
Environment: Set PENNEO_ENV=production for production, defaults to sandbox.
"""

import os
import json
import time
import argparse
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

ENV = "production" if os.getenv("PENNEO_ENV") == "production" else "sandbox"

CONFIG = {
    "sandbox": {
        "create_url": "https://sandbox.penneo.com/send/api/v1/casefiles/20251022/create",
        "status_url": "https://sandbox.penneo.com/send/api/v1/queue/public/status",
    },
    "production": {
        "create_url": "https://app.penneo.com/send/api/v1/casefiles/20251022/create",
        "status_url": "https://app.penneo.com/send/api/v1/queue/public/status",
    },
}

create_url = CONFIG[ENV]["create_url"]
status_url = CONFIG[ENV]["status_url"]
ACCESS_TOKEN = os.getenv("ACCESS_TOKEN")

if not ACCESS_TOKEN:
    raise EnvironmentError("ACCESS_TOKEN must be set. Run authenticate.py first.")

# --- Parse arguments ---
parser = argparse.ArgumentParser()
parser.add_argument("--title", required=True)
parser.add_argument("--files", nargs="+", required=True)
parser.add_argument("--signers", nargs="+", required=True, help="Format: \"Full Name:email@example.com\"")
parser.add_argument("--sequential", action="store_true")
parser.add_argument("--extra", type=str, default=None, help="JSON string merged into the caseFile object")
args = parser.parse_args()

# --- Validate files ---
for f in args.files:
    if not Path(f).exists():
        raise FileNotFoundError(f"File not found: {f}")

# --- Parse signers ---
signers = []
for i, s in enumerate(args.signers):
    parts = s.split(":", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid signer format \"{s}\". Expected \"Full Name:email@example.com\"")
    name, email = parts
    signer = {"name": name, "email": email, "role": "signer"}
    if args.sequential:
        signer["signOrder"] = i
    signers.append(signer)

# --- Build case file data ---
documents = [{"title": Path(f).stem, "name": Path(f).name} for f in args.files]
case_file = {"title": args.title, "signers": signers, "documents": documents}

if args.extra:
    extra = json.loads(args.extra)
    case_file.update(extra)

case_file_data = {"caseFile": case_file}

# --- Submit case file ---
print(f"\nSubmitting \"{args.title}\" for signing ({ENV})...")

file_handles = [open(f, "rb") for f in args.files]
try:
    res = requests.post(
        create_url,
        headers={"X-Auth-Token": ACCESS_TOKEN},
        data={"data": json.dumps(case_file_data)},
        files=[("files", (Path(f).name, fh, "application/pdf")) for f, fh in zip(args.files, file_handles)],
    )
finally:
    for fh in file_handles:
        fh.close()

if not res.ok:
    raise RuntimeError(f"Case file creation failed: {res.json()}")

jobs = res.json()["jobs"]
uuid = jobs[0]["uuid"]
payload_hash = jobs[0]["payloadHash"]
print("Job queued. Waiting for confirmation...")

# --- Poll for job status ---
MAX_ATTEMPTS = 20
POLL_INTERVAL = 3

for attempt in range(MAX_ATTEMPTS):
    time.sleep(POLL_INTERVAL)

    status_res = requests.post(
        status_url,
        json={"uuid": uuid, "payloadHash": payload_hash},
    )

    if not status_res.ok:
        raise RuntimeError(f"Status check failed: {status_res.text}")

    job = status_res.json()

    if job["jobStatus"] == "completed":
        print(f"\nDocument successfully sent for signing!")
        print(f"Case File ID: {job['result']['data']['caseFile']['id']}")
        print("\nSigning links:")
        for s in job["result"]["data"]["signingLinks"]:
            print(f"  {s['name']} ({s['role']}): {s['signingLink']}")
        break
    elif job["jobStatus"] == "failed":
        raise RuntimeError(f"Job failed: {job.get('errorMessage')}")
    elif job["jobStatus"] == "aborted_duplicated":
        raise RuntimeError("Job aborted — duplicate submission detected.")

    if attempt == MAX_ATTEMPTS - 1:
        raise RuntimeError("Timed out waiting for job to complete.")
