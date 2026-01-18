#!/usr/bin/env python3
"""Gmail OAuth2 setup script.

This script helps authorize Claude's Gmail account (your-claude-email@gmail.com)
for autonomous email sending.

Steps:
1. Reads gmail-credentials.json (downloaded from Google Cloud Console)
2. Generates OAuth2 authorization URL
3. Opens browser for authorization
4. Gets authorization code from user
5. Exchanges code for tokens
6. Saves refresh token to database

Usage:
    ./venv/bin/python .engine/src/cli/gmail_oauth_setup.py
"""

import json
import os
import sys
import uuid
import webbrowser
from pathlib import Path
from urllib.parse import urlencode

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.storage import SystemStorage

# Gmail API scopes
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',  # NEW - for sending
]

CREDENTIALS_PATH = Path(__file__).parent.parent.parent / 'config' / 'gmail-credentials.json'


def load_credentials():
    """Load OAuth2 credentials from file."""
    if not CREDENTIALS_PATH.exists():
        print(f"\n❌ Error: Credentials file not found at {CREDENTIALS_PATH}")
        print("\nPlease complete these steps first:")
        print("1. Go to Google Cloud Console")
        print("2. Create OAuth2 credentials (Desktop app)")
        print("3. Download JSON file")
        print(f"4. Save it as: {CREDENTIALS_PATH}")
        print("\nSee Workspace/working/claude-email-setup.md for detailed steps.")
        sys.exit(1)

    with open(CREDENTIALS_PATH) as f:
        data = json.load(f)

    # Google credentials JSON has nested structure
    if 'installed' in data:
        creds = data['installed']
    elif 'web' in data:
        creds = data['web']
    else:
        creds = data

    return {
        'client_id': creds['client_id'],
        'client_secret': creds['client_secret'],
        'redirect_uri': creds.get('redirect_uris', ['urn:ietf:wg:oauth:2.0:oob'])[0],
    }


def get_authorization_url(client_id: str, redirect_uri: str) -> str:
    """Generate OAuth2 authorization URL."""
    params = {
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': ' '.join(SCOPES),
        'access_type': 'offline',
        'prompt': 'consent',
    }

    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def exchange_code_for_tokens(code: str, client_id: str, client_secret: str, redirect_uri: str) -> dict:
    """Exchange authorization code for access and refresh tokens."""
    import requests

    response = requests.post('https://oauth2.googleapis.com/token', data={
        'code': code,
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code',
    })

    if response.status_code != 200:
        print(f"\n❌ Token exchange failed: {response.text}")
        sys.exit(1)

    return response.json()


def save_to_database(client_id: str, client_secret: str, refresh_token: str) -> str:
    """Save Gmail credentials to database."""
    db_path = Path(__file__).parent.parent.parent / 'data' / 'db' / 'system.db'
    storage = SystemStorage(db_path)

    # Create account ID
    account_id = str(uuid.uuid4())

    # Save to email_accounts table
    storage.execute("""
        INSERT INTO email_accounts (
            id, provider, display_name, primary_email, enabled, config_json,
            can_read, can_send, can_draft, is_claude_account
        )
        VALUES (?, 'gmail', 'Claude Assistant', 'your-claude-email@gmail.com', 1, ?, 1, 1, 1, 1)
    """, (
        account_id,
        json.dumps({
            'client_id': client_id,
            'client_secret': client_secret,
            'refresh_token': refresh_token,
        })
    ))

    # Set as Claude's account in settings
    storage.execute("""
        UPDATE email_settings
        SET value = ?
        WHERE key = 'claude_account_id'
    """, (account_id,))

    return account_id


def main():
    """Run OAuth2 setup flow."""
    print("\n" + "="*70)
    print("Gmail OAuth2 Setup for Claude's Email Account")
    print("="*70)
    print("\nThis will authorize your-claude-email@gmail.com for sending emails.")
    print("\nMake sure you've completed the Google Cloud Console setup first!")
    print("See: Workspace/working/claude-email-setup.md\n")

    # Load credentials
    print("📄 Loading credentials from gmail-credentials.json...")
    creds = load_credentials()
    print(f"✅ Loaded client ID: {creds['client_id'][:30]}...")

    # Generate authorization URL
    auth_url = get_authorization_url(creds['client_id'], creds['redirect_uri'])

    print("\n" + "="*70)
    print("STEP 1: Authorize in Browser")
    print("="*70)
    print("\nOpening browser for authorization...")
    print("If it doesn't open automatically, visit this URL:\n")
    print(auth_url)
    print("\n")

    # Open browser
    try:
        webbrowser.open(auth_url)
    except Exception:
        pass

    print("In the browser:")
    print("1. Sign in as your-claude-email@gmail.com")
    print("2. Click 'Continue' (it will warn about unverified app - this is OK)")
    print("3. Grant all 4 Gmail permissions")
    print("4. Copy the authorization code")
    print("\n")

    # Get authorization code from user
    code = input("Paste the authorization code here: ").strip()

    if not code:
        print("\n❌ No code provided. Exiting.")
        sys.exit(1)

    # Exchange code for tokens
    print("\n📡 Exchanging code for tokens...")
    tokens = exchange_code_for_tokens(
        code,
        creds['client_id'],
        creds['client_secret'],
        creds['redirect_uri']
    )

    if 'refresh_token' not in tokens:
        print("\n❌ No refresh token received. This might happen if you've already authorized.")
        print("To fix: Revoke app access at https://myaccount.google.com/permissions")
        print("Then run this script again.")
        sys.exit(1)

    refresh_token = tokens['refresh_token']
    print("✅ Got refresh token!")

    # Save to database
    print("\n💾 Saving to database...")
    account_id = save_to_database(
        creds['client_id'],
        creds['client_secret'],
        refresh_token
    )
    print(f"✅ Saved as account ID: {account_id}")

    print("\n" + "="*70)
    print("✅ Setup Complete!")
    print("="*70)
    print("\nClaude can now send emails from your-claude-email@gmail.com")
    print("\nNext steps:")
    print("1. Test sending an email via MCP tool")
    print("2. Verify it arrives in your inbox")
    print("3. Check send log in database")
    print("\nSafeguards enabled:")
    print("- 15 second send delay (time to cancel)")
    print("- 50 emails/hour rate limit")
    print("- All sends logged to email_send_log")
    print("\n")


if __name__ == '__main__':
    main()
