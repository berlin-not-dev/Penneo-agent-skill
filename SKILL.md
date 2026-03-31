---
name: penneo-agent-skill
description: Send documents for signing via Penneo, check the status of a case file, and list case files by status or date. Use this skill when the user wants to get a contract or document signed, check who has signed, or get an overview of pending or completed signing requests.
compatibility: Requires Node.js >=18 or Python 3.11+. Network access to penneo.com (production) or sandbox.penneo.com (sandbox). Credentials configured in a .env file.
allowed-tools: Bash Read
---

# Penneo Signing Skill

This skill enables a user to interact with **Penneo** — a document signing platform that creates authentic digital evidence. It supports the following capabilities:

- **Send documents for signing** — upload PDFs, add signers, and optionally enforce a signing order
- **Check signing status** — look up the current status of a specific case file and see which signers have signed
- **List and summarise case files** — get an overview of case files filtered by status (pending, completed, rejected, draft, expired) or all at once
- **Check signing status** — look up the current status of a case file and see which signers have signed

Keep all interactions in plain, friendly language — avoid exposing JSON structures, API details, or technical implementation unless the user explicitly asks for them.

---

## Prerequisites — Create an OAuth Client in Penneo (One-time Setup)

Before the user can authenticate, they need to create an OAuth client in their Penneo account. Walk the user through this if they haven't done it yet:

1. Log in to the Penneo web application.
2. Ensure that you are an **Administrator** on the account.
3. Navigate to **Configure > OAuth Clients**.
4. Create a new client.
5. Add the following redirect URI exactly as shown: `http://localhost:8765/callback`
6. Save the client and store the generated credentials in a `.env` file:

```bash
PENNEO_CLIENT_ID=your_client_id
PENNEO_CLIENT_SECRET=your_client_secret
```

> ⚠️ Never commit the `.env` file to source control — add it to `.gitignore`.

> ⚠️ **Sandbox and production use separate OAuth clients and credentials — they are not interchangeable.** Make sure the credentials in `.env` match the environment you intend to use.

> **Before proceeding**, confirm with the user that they have completed the above steps and that `http://localhost:8765/callback` has been added as the redirect URI. Do not continue until confirmed.

---

## Scripts

Ready-made scripts are provided for both Node.js and Python. Always use these — never generate new code to handle authentication or casefile creation.

```
scripts/
├── node/
│   ├── authenticate.js       # OAuth flow — opens browser, captures token
│   └── send-for-signing.js   # Submits documents for signing and polls for completion
├── python/
│   ├── authenticate.py       # OAuth flow — opens browser, captures token
│   └── send-for-signing.py   # Submits documents for signing and polls for completion
```

Set `PENNEO_ENV=production` in the `.env` file to target production — defaults to sandbox.

---

## Sending Documents for Signing

### Step 1 — Collect Information from the User

Before doing anything, conversationally collect the following information. Ask naturally — do not present forms, JSON, or technical fields. Ask for all information up front in one go where possible.

**What to ask:**
- Should this be sent to **sandbox or production**? Confirm explicitly — mistakes here are hard to undo.
- What is the **title** of the signing request? (e.g. "Employment Contract", "NDA")
- Which **document(s)** should be sent? Ask the user to provide the file path(s) to the PDF(s).
- Who are the **signer(s)**? For each signer, collect:
  - Full name
  - Email address
- Should the signers sign in a specific **order**, or can they all sign at the same time?

Example of how to ask:
> "Sure! What would you like to call this signing request? And which PDF(s) should I send — can you share the file path(s)? Finally, who needs to sign — I'll need their name(s) and email address(es)."

### Step 2 — Authenticate

Run the authentication script to log the user in to Penneo:

```bash
# Node.js
node scripts/node/authenticate.js

# Python
python scripts/python/authenticate.py
```

This will open the user's browser for login. Once completed, the access token is automatically saved to the `.env` file and will be picked up by the send-for-signing script. Let the user know what is happening in plain language:
> "I'll open your browser now so you can log in to Penneo."

### Step 3 — Send the Documents for Signing

Once authenticated, run the send-for-signing script with the collected information:

```bash
# Node.js
node scripts/node/send-for-signing.js \
  --title "Contract Agreement" \
  --files "./contract.pdf" "./appendix.pdf" \
  --signers "Jane Doe:jane@example.com" "John Smith:john@example.com" \
  --sequential

# Python
python scripts/python/send-for-signing.py \
  --title "Contract Agreement" \
  --files "./contract.pdf" "./appendix.pdf" \
  --signers "Jane Doe:jane@example.com" "John Smith:john@example.com" \
  --sequential
```

- `--files` accepts one or more PDF file paths.
- `--signers` accepts one or more `"Full Name:email@example.com"` pairs.
- `--sequential` is optional — include it if the user wants signers to sign in order.

---

## Checking the Status of a Signing Request

If the user asks about the status of a signing request, run the check-status script with the case file ID:

```bash
# Node.js
node scripts/node/check-status.js --casefile-id 1262730

# Python
python scripts/python/check-status.py --casefile-id 1262730
```

The script will return the overall status and which signers have signed. Translate the output into friendly language:

> "Your signing request 'Contract Agreement' is still pending — Mads has signed but Nikita is still waiting to sign."

> "Great news — 'Contract Agreement' has been completed and signed by everyone!"

---

### Step 4 — Share the Signing Links

Once complete, the script outputs a signing link for each signer. Share these with the user in a friendly way:

> "Done! Here are the signing links — share these with your signers:
> - Jane Doe: https://sandbox.penneo.com/signing/XXXXX
> - John Smith: https://sandbox.penneo.com/signing/XXXXX"

---

## Additional Case File Options

Do **not** ask about these upfront. Only use them if the user specifically requests it. Pass them via `--extra` as a JSON string merged into the case file.

```bash
# Node.js
node scripts/node/send-for-signing.js \
  --title "Contract" \
  --files "./contract.pdf" \
  --signers "Jane Doe:jane@example.com" \
  --extra '{"language":"en","ccRecipients":[{"name":"Legal Team","email":"legal@company.com"}]}'

# Python
python scripts/python/send-for-signing.py \
  --title "Contract" \
  --files "./contract.pdf" \
  --signers "Jane Doe:jane@example.com" \
  --extra '{"language":"en","ccRecipients":[{"name":"Legal Team","email":"legal@company.com"}]}'
```

### Supported extra fields

| User asks | Field to include in `--extra` JSON |
|-----------|-----------------------------------|
| "send it in Danish / French / etc." | `"language": "da"` (or `"en"`, `"sv"`, `"nb"`, `"fr"`, etc.) |
| "also notify legal@company.com when done" | `"ccRecipients": [{"name": "Legal Team", "email": "legal@company.com"}]` |
| "expires in 7 days" / "set an expiry" | `"expireAt": <Unix timestamp>` |
| "remind them every 3 days" | Set on the signer object: `"reminderInterval": 3` |
| "use a custom email subject/body" | Set on the signer object: `"emailSubject": "..."`, `"emailText": "..."` |
| "send a reminder email when done" | Set on the signer object: `"completedEmailSubject": "..."`, `"completedEmailText": "..."` |
| "redirect to X after signing" | Set on the signer object: `"successUrl": "https://..."` |
| "redirect to X if they reject" | Set on the signer object: `"failUrl": "https://..."` |
| "require signers to authenticate" | Set on the signer object: `"accessControl": true` |
| "don't attach the signed doc to emails" | `"disableEmailAttachments": true` |
| "mark as sensitive data" | `"sensitiveData": true` |
| "don't notify me when it's done" | `"disableNotificationsOwner": true` |

**Signer-level fields** go inside each signer object in the signers array — not at the top level. When combining top-level and signer-level fields, build the full `--extra` JSON accordingly.

---

## Listing and Summarising Case Files

When the user asks for an overview of their case files, run the list-casefiles script. It supports flexible filtering via `--status` and `--filter key=value` (repeatable). Pagination is handled automatically.

```bash
# Node.js examples
node scripts/node/list-casefiles.js
node scripts/node/list-casefiles.js --status pending
node scripts/node/list-casefiles.js --status completed --filter sort=-created
node scripts/node/list-casefiles.js --filter title=Contract --filter createdAfter=1735689600

# Python examples
python scripts/python/list-casefiles.py --status pending
python scripts/python/list-casefiles.py --filter sort=-created --filter completedAfter=1735689600
```

Present results conversationally — never show raw script output. For example:

> "You have 3 pending case files:
> - **Employment Contract** (ID 1262132) — waiting on Mads to sign, expires 23 Jun 2025
> - **NDA with Acme** (ID 1262209) — waiting on Nikita to sign, expires 25 Jun 2025"

If the user asks a follow-up about a specific case file, use the check-status script with the ID.

### Query Parameter Reference

Use this table to translate user requests into the right `--filter` combinations. Date filters take **Unix timestamps** — always convert natural language dates (e.g. "this month", "last week", "in March") to Unix timestamps before passing them.

| User says | Script flags to use |
|-----------|-------------------|
| "show me pending cases" | `--status pending` |
| "show me completed cases" | `--status completed` |
| "show me rejected cases" | `--status rejected` |
| "show me drafts" | `--status draft` |
| "show me expired cases" | `--status expired` |
| "show me everything" | *(no flags)* |
| "cases with 'NDA' in the title" | `--filter title=NDA` |
| "cases created this month" | `--filter createdAfter=<start of month timestamp>` |
| "cases created in March" | `--filter createdAfter=<Mar 1 timestamp> --filter createdBefore=<Apr 1 timestamp>` |
| "cases completed last week" | `--filter completedAfter=<timestamp> --filter completedBefore=<timestamp>` |
| "cases expiring soon" | `--filter expiresAfter=<now> --filter expiresBefore=<30 days from now>` |
| "cases updated today" | `--filter updatedAfter=<start of today timestamp>` |
| "show newest first" | `--filter sort=-created` |
| "sort alphabetically" | `--filter sort=title` |
| "pending NDAs sorted by newest" | `--status pending --filter title=NDA --filter sort=-created` |

### Available filter keys

| Key | Description |
|-----|-------------|
| `title` | Match string in title |
| `status` | Handled via `--status` flag (draft/pending/rejected/completed/expired) |
| `createdAfter` / `createdBefore` | Unix timestamp — filter by creation date |
| `completedAfter` / `completedBefore` | Unix timestamp — filter by completion date |
| `activatedAfter` / `activatedBefore` | Unix timestamp — filter by activation date |
| `expiresAfter` / `expiresBefore` | Unix timestamp — filter by expiry date |
| `updatedAfter` / `updatedBefore` | Unix timestamp — filter by last updated date |
| `sort` | Field to sort by. Prepend `-` for descending (e.g. `-created`, `-title`) |
| `ids` | Comma-separated case file IDs |
| `folderIds` | Comma-separated folder IDs |
| `metaData` | Match string in metadata |
| `reference` | External reference ID |

---

## API Reference

For the full OpenAPI specification of the case file creation and job status endpoints, see [references/send-api.json](references/send-api.json).

> **Note:** The send API (`/send/api/v1/`) uses `X-Auth-Token` for authentication. The list/status API (`/api/v1/`) uses `Authorization: Bearer <token>`.

---

## Environment

| | Sandbox | Production |
|---|---|---|
| **Auth URL** | `https://sandbox.oauth.penneo.cloud/oauth/token` | `https://login.penneo.com/oauth/token` |
| **Case File Creation** | `https://sandbox.penneo.com/send/api/v1/casefiles/20251022/create` | `https://app.penneo.com/send/api/v1/casefiles/20251022/create` |
| **Job Status** | `https://sandbox.penneo.com/send/api/v1/queue/public/status` | `https://app.penneo.com/send/api/v1/queue/public/status` |

⚠️ **Credentials must match the environment.** Sandbox and production use separate OAuth clients and credentials — they are not interchangeable.

---

## Error Handling

If something goes wrong, explain it to the user in plain language — never show raw error responses. Use the table below to guide your response:

| Status | Plain language message |
|--------|----------------------|
| `401` | "Your session has expired — this happens after about 10 minutes of inactivity. I'll open your browser so you can log in again." Then re-run the authentication script and retry the last action automatically. |
| `403` | "It seems you don't have permission to do that. Make sure your Penneo account has the correct access rights." |
| `404` | "Something couldn't be found. Please check that your file paths are correct." |
| `429` | "Penneo is receiving too many requests right now. I'll wait a moment and try again." |
| `500` | "Penneo encountered an unexpected error. Please try again in a moment." |
| `failed` job | "The signing request couldn't be completed. Here's what went wrong: [errorMessage]" |
| `aborted_duplicated` | "It looks like this request was already submitted. Please check Penneo to see if the case file was already created." |
