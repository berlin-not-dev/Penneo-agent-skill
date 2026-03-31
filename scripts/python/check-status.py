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
from datetime import datetime
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

SIGNER_STATUSES = {
    0: "Request sent",
    1: "Request opened",
    2: "Opened",
    3: "Signed",
    4: "Rejected",
    6: "Undeliverable",
    8: "Finalized",
    9: "Deleted",
}

parser = argparse.ArgumentParser()
parser.add_argument("--casefile-id", required=True)
args = parser.parse_args()

res = requests.get(
    f"{api_url}/{args.casefile_id}",
    headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
)

if not res.ok:
    raise RuntimeError(f"Failed to fetch case file: {res.status_code}")

data = res.json()

case_status = STATUSES.get(data["status"], f"Unknown ({data['status']})")
expire = datetime.fromtimestamp(data["expireAt"]).strftime("%d %b %Y") if data.get("expireAt") else "—"

print(f"\nCase File: {data['title']}")
print(f"Status: {case_status}")
print(f"Expires: {expire}")

if data.get("signers"):
    print("\nSigners:")
    for signer in data["signers"]:
        signer_status = signer.get("signingRequest", {}).get("status")
        signer_status_label = SIGNER_STATUSES.get(signer_status, f"Unknown ({signer_status})")
        print(f"  {signer['name']}: {signer_status_label}")
