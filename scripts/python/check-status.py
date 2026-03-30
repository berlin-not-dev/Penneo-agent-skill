"""
Penneo — Check the status of a case file.

Usage:
  python check-status.py --casefile-id 1262730

Requires: ACCESS_TOKEN in environment variables (from authenticate.py).
Environment: Set PENNEO_ENV=production for production, defaults to sandbox.
"""

import os
import argparse
import requests
from dotenv import load_dotenv

load_dotenv()

ENV = "production" if os.getenv("PENNEO_ENV") == "production" else "sandbox"

CONFIG = {
    "sandbox": {
        "api_url": "https://sandbox.penneo.com/api/v1/casefiles",
    },
    "production": {
        "api_url": "https://app.penneo.com/api/v1/casefiles",
    },
}

api_url = CONFIG[ENV]["api_url"]
ACCESS_TOKEN = os.getenv("ACCESS_TOKEN")

if not ACCESS_TOKEN:
    raise EnvironmentError("ACCESS_TOKEN must be set. Run authenticate.py first.")

STATUSES = {
    0: "Draft",
    1: "Pending — waiting for signatures",
    2: "Rejected",
    3: "Deleted",
    5: "Completed",
    7: "Expired",
}

parser = argparse.ArgumentParser()
parser.add_argument("--casefile-id", required=True)
args = parser.parse_args()

res = requests.get(
    f"{api_url}/{args.casefile_id}",
    headers={"X-Auth-Token": ACCESS_TOKEN},
)

if not res.ok:
    raise RuntimeError(f"Failed to fetch case file: {res.status_code}")

data = res.json()

status_label = STATUSES.get(data["status"], f"Unknown ({data['status']})")
print(f"\nCase File: {data['title']}")
print(f"Status: {status_label}")

# Show per-signer signing status
if data.get("signers"):
    print("\nSigners:")
    for signer in data["signers"]:
        signed = any(
            sl.get("signedAt")
            for doc in data.get("documents", [])
            for sl in doc.get("signatureLines", [])
            if sl.get("signerId") == signer["id"]
        )
        signed_label = "Signed" if signed else "Awaiting signature"
        print(f"  {signer['name']}: {signed_label}")
