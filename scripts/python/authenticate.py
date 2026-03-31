"""
Penneo OAuth 2.0 Authentication (Authorization Code Grant with PKCE)
Opens the user's browser for login and captures the callback on localhost:8765.
Returns an access token on success.

Usage: python authenticate.py
Requires: PENNEO_CLIENT_ID, PENNEO_CLIENT_SECRET in environment variables.
Environment: Set PENNEO_ENV=production for production, defaults to sandbox.
"""

import os
import hashlib
import secrets
import base64
import webbrowser
import urllib.parse
import requests
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from dotenv import load_dotenv, set_key

load_dotenv()

ENV = "production" if os.getenv("PENNEO_ENV") == "production" else "sandbox"

CONFIG = {
    "sandbox": {
        "auth_url": "https://sandbox.oauth.penneo.cloud/oauth/authorize",
        "token_url": "https://sandbox.oauth.penneo.cloud/oauth/token",
    },
    "production": {
        "auth_url": "https://login.penneo.com/oauth/authorize",
        "token_url": "https://login.penneo.com/oauth/token",
    },
}

auth_url = CONFIG[ENV]["auth_url"]
token_url = CONFIG[ENV]["token_url"]
REDIRECT_URI = "http://localhost:8765/callback"
CLIENT_ID = os.getenv("PENNEO_CLIENT_ID")
CLIENT_SECRET = os.getenv("PENNEO_CLIENT_SECRET")

if not CLIENT_ID or not CLIENT_SECRET:
    raise EnvironmentError("PENNEO_CLIENT_ID and PENNEO_CLIENT_SECRET must be set in environment variables.")


# --- PKCE helpers ---
def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

code_verifier = base64url_encode(secrets.token_bytes(32))
code_challenge = base64url_encode(hashlib.sha256(code_verifier.encode()).digest())
state = secrets.token_hex(16)

# --- Shared callback result ---
callback_result = {}

class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h2>Login successful! You can close this tab and return to your terminal.</h2>")
        callback_result["code"] = params.get("code", [None])[0]
        callback_result["state"] = params.get("state", [None])[0]
        callback_result["error"] = params.get("error", [None])[0]

    def log_message(self, format, *args):
        pass  # Suppress server logs


# --- Build authorization URL and open browser ---
params = urllib.parse.urlencode({
    "response_type": "code",
    "client_id": CLIENT_ID,
    "redirect_uri": REDIRECT_URI,
    "code_challenge": code_challenge,
    "code_challenge_method": "S256",
    "state": state,
})
login_url = f"{auth_url}?{params}"

print(f"\nOpening Penneo login in your browser ({ENV})...")
webbrowser.open(login_url)

# --- Start local callback server (handles one request then stops) ---
server = HTTPServer(("localhost", 8765), CallbackHandler)
server.handle_request()

if callback_result.get("error"):
    raise RuntimeError(f"OAuth error: {callback_result['error']}")

if callback_result.get("state") != state:
    raise RuntimeError("State mismatch. Possible CSRF attack.")

code = callback_result["code"]

# --- Exchange code for token ---
res = requests.post(token_url, json={
    "grant_type": "authorization_code",
    "code": code,
    "redirect_uri": REDIRECT_URI,
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "code_verifier": code_verifier,
})

if not res.ok:
    raise RuntimeError(f"Token exchange failed: {res.json()}")

token = res.json()
print("\nAuthentication successful!")

# Write ACCESS_TOKEN to .env for use by send-for-signing.py
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
set_key(str(env_path), "ACCESS_TOKEN", token["access_token"])
print(f"Access token saved to .env")

# Export for use by other scripts
ACCESS_TOKEN = token["access_token"]
