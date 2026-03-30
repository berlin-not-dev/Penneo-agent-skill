/**
 * Penneo OAuth 2.0 Authentication (Authorization Code Grant with PKCE)
 * Opens the user's browser for login and captures the callback on localhost:8765.
 * Returns an access token on success.
 *
 * Usage: node authenticate.js
 * Requires: PENNEO_CLIENT_ID, PENNEO_CLIENT_SECRET in environment variables.
 * Environment: Set PENNEO_ENV=production for production, defaults to sandbox.
 */

import http from "http";
import url from "url";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import "dotenv/config";

const ENV = process.env.PENNEO_ENV === "production" ? "production" : "sandbox";

const CONFIG = {
  sandbox: {
    authUrl: "https://sandbox.oauth.penneo.cloud/oauth/authorize",
    tokenUrl: "https://sandbox.oauth.penneo.cloud/oauth/token",
  },
  production: {
    authUrl: "https://login.penneo.com/oauth/authorize",
    tokenUrl: "https://login.penneo.com/oauth/token",
  },
};

const { authUrl, tokenUrl } = CONFIG[ENV];
const REDIRECT_URI = "http://localhost:8765/callback";
const CLIENT_ID = process.env.PENNEO_CLIENT_ID;
const CLIENT_SECRET = process.env.PENNEO_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Error: PENNEO_CLIENT_ID and PENNEO_CLIENT_SECRET must be set in environment variables.");
  process.exit(1);
}

// --- PKCE helpers ---
const base64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

const codeVerifier = base64url(crypto.randomBytes(32));
const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
const state = crypto.randomBytes(16).toString("hex");

// --- Build authorization URL ---
const params = new URLSearchParams({
  response_type: "code",
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  code_challenge: codeChallenge,
  code_challenge_method: "S256",
  state,
});
const loginUrl = `${authUrl}?${params.toString()}`;

// --- Start local callback server ---
const server = http.createServer();
const callbackPromise = new Promise((resolve, reject) => {
  server.on("request", (req, res) => {
    const { query } = url.parse(req.url, true);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h2>Login successful! You can close this tab and return to your terminal.</h2>");
    server.close();
    if (query.error) reject(new Error(`OAuth error: ${query.error}`));
    else resolve({ code: query.code, returnedState: query.state });
  });
});
server.listen(8765);

// --- Open browser ---
console.log(`\nOpening Penneo login in your browser (${ENV})...`);
const opener =
  process.platform === "win32" ? "start" :
  process.platform === "darwin" ? "open" : "xdg-open";
exec(`${opener} "${loginUrl}"`);

// --- Await callback ---
const { code, returnedState } = await callbackPromise;

if (returnedState !== state) {
  console.error("Error: State mismatch. Possible CSRF attack.");
  process.exit(1);
}

// --- Exchange code for token ---
const tokenRes = await fetch(tokenUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code_verifier: codeVerifier,
  }),
});

if (!tokenRes.ok) {
  const err = await tokenRes.json();
  console.error("Token exchange failed:", err);
  process.exit(1);
}

const token = await tokenRes.json();
console.log("\nAuthentication successful!");
console.log("Expires at:", new Date(token.access_token_expires_at * 1000).toISOString());

// Write ACCESS_TOKEN to .env for use by send-for-signing.js
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");
let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
if (/^ACCESS_TOKEN=/m.test(envContent)) {
  envContent = envContent.replace(/^ACCESS_TOKEN=.*/m, `ACCESS_TOKEN=${token.access_token}`);
} else {
  envContent += `\nACCESS_TOKEN=${token.access_token}`;
}
fs.writeFileSync(envPath, envContent);
console.log("Access token saved to .env");

export default token.access_token;
