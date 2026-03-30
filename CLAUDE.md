# Penneo Signing Skill

This skill enables a user to send documents for signing using **Penneo** — a document signing platform that creates authentic digital evidence. When a user wants to send a document for signing, follow the steps below. Keep all interactions in plain, friendly language — avoid exposing JSON structures, API details, or technical implementation unless the user explicitly asks for them.

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
