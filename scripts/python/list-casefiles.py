"""
Penneo — List case files with optional status filter.
Handles pagination automatically.

Usage:
  python list-casefiles.py                        # All case files
  python list-casefiles.py --status pending       # Pending only
  python list-casefiles.py --status completed     # Completed only
  python list-casefiles.py --status rejected      # Rejected only
  python list-casefiles.py --status draft         # Drafts only
  python list-casefiles.py --status expired       # Expired only

Requires: ACCESS_TOKEN in environment variables (from authenticate.py).
Environment: Set PENNEO_ENV=production for production, defaults to sandbox.
"""

import os
import re
import argparse
import requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

ENV = "production" if os.getenv("PENNEO_ENV") == "production" else "sandbox"

CONFIG = {
    "sandbox": {"api_url": "https://sandbox.penneo.com/api/v1/casefiles"},
    "production": {"api_url": "https://app.penneo.com/api/v1/casefiles"},
}

api_url = CONFIG[ENV]["api_url"]
ACCESS_TOKEN = os.getenv("ACCESS_TOKEN")

if not ACCESS_TOKEN:
    raise EnvironmentError("ACCESS_TOKEN must be set. Run authenticate.py first.")

STATUS_LABELS = {
    0: "Draft",
    1: "Pending",
    2: "Rejected",
    3: "Deleted",
    5: "Completed",
    7: "Expired",
}

STATUS_MAP = {
    "draft": 0,
    "pending": 1,
    "rejected": 2,
    "deleted": 3,
    "completed": 5,
    "expired": 7,
}

SIGNER_STATUS_LABELS = {
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
parser.add_argument("--status", type=str, help="Filter by status: draft, pending, rejected, completed, expired")
args = parser.parse_args()

params = {}
if args.status:
    status_key = args.status.lower()
    if status_key not in STATUS_MAP:
        raise ValueError(f"Unknown status '{args.status}'. Valid options: {', '.join(STATUS_MAP.keys())}")
    params["status"] = STATUS_MAP[status_key]

# --- Paginate through all results ---
def parse_next_link(link_header):
    if not link_header:
        return None
    match = re.search(r'<([^>]+)>;\s*rel="next"', link_header)
    return match.group(1) if match else None

casefiles = []
url = api_url
while url:
    res = requests.get(
        url,
        headers={"X-Auth-Token": ACCESS_TOKEN, "x-paginate": "true"},
        params=params if url == api_url else None,
    )
    if not res.ok:
        raise RuntimeError(f"Failed to fetch case files: {res.status_code}")

    casefiles.extend(res.json())
    url = parse_next_link(res.headers.get("Link"))
    params = None  # Only pass params on the first request

# --- Output ---
label = args.status.capitalize() if args.status else "All"
print(f"\n{label} case files ({len(casefiles)} found):\n")

if not casefiles:
    print("  No case files found.")
else:
    for cf in casefiles:
        status = STATUS_LABELS.get(cf["status"], f"Unknown ({cf['status']})")
        expire = datetime.fromtimestamp(cf["expireAt"]).strftime("%d %b %Y") if cf.get("expireAt") else "—"
        print(f"  [{cf['id']}] {cf['title']}  |  {status}  |  Expires: {expire}")
        for signer in cf.get("signers", []):
            signer_status = signer.get("signingRequest", {}).get("status")
            signer_label = SIGNER_STATUS_LABELS.get(signer_status, f"Unknown ({signer_status})")
            print(f"    - {signer['name']}: {signer_label}")
