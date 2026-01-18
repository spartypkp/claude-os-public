"""Gmail adapter - Google Gmail API integration.

This adapter uses the Gmail API for full-featured Gmail access:
- Read emails with full threading support
- Labels (Gmail's version of folders)
- Search with Gmail's powerful query syntax
- Draft creation

Requirements:
- Google Cloud project with Gmail API enabled
- OAuth2 credentials (client_id, client_secret)
- User authorization (refresh_token)

Setup:
1. Create project at https://console.cloud.google.com
2. Enable Gmail API
3. Create OAuth2 credentials (Desktop app)
4. Run authorization flow to get refresh_token
5. Store credentials in email_accounts table

Note: Claude NEVER sends email. Drafts are created for user review.
"""

from __future__ import annotations

import base64
import logging
from datetime import datetime
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional

from .base import (
    EmailAdapter,
    EmailMessage,
    Mailbox,
    DraftMessage,
    ProviderType,
)

logger = logging.getLogger(__name__)

# Gmail API scopes needed
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
]


class GmailAdapter(EmailAdapter):
    """Gmail API adapter.
    
    Provides full Gmail integration including labels, threading,
    and Gmail's powerful search syntax.
    
    Config required in email_accounts:
        {
            "client_id": "your-client-id.apps.googleusercontent.com",
            "client_secret": "your-client-secret",
            "refresh_token": "user-refresh-token"
        }
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize Gmail adapter.
        
        Args:
            config: OAuth2 credentials dict with client_id, client_secret, refresh_token
        """
        self._config = config or {}
        self._service = None
        self._credentials = None
    
    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.GMAIL
    
    @property
    def display_name(self) -> str:
        return "Gmail"
    
    def _get_service(self):
        """Get or create Gmail API service."""
        if self._service is not None:
            return self._service
        
        try:
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build
            
            if not all(k in self._config for k in ['client_id', 'client_secret', 'refresh_token']):
                logger.warning("Gmail credentials not configured")
                return None
            
            self._credentials = Credentials(
                token=None,
                refresh_token=self._config['refresh_token'],
                token_uri='https://oauth2.googleapis.com/token',
                client_id=self._config['client_id'],
                client_secret=self._config['client_secret'],
                scopes=SCOPES,
            )
            
            self._service = build('gmail', 'v1', credentials=self._credentials)
            return self._service
            
        except ImportError:
            logger.error("google-api-python-client not installed. Run: pip install google-api-python-client google-auth")
            return None
        except Exception as e:
            logger.error(f"Failed to initialize Gmail service: {e}")
            return None
    
    def is_available(self) -> bool:
        """Check if Gmail is configured and accessible."""
        service = self._get_service()
        if not service:
            return False
        
        try:
            # Try to get profile to verify connection
            service.users().getProfile(userId='me').execute()
            return True
        except Exception as e:
            logger.warning(f"Gmail not available: {e}")
            return False
    
    def get_accounts(self) -> List[str]:
        """Get the authenticated Gmail account."""
        service = self._get_service()
        if not service:
            return []
        
        try:
            profile = service.users().getProfile(userId='me').execute()
            return [profile.get('emailAddress', 'Gmail')]
        except Exception as e:
            logger.error(f"Failed to get Gmail profile: {e}")
            return []
    
    def get_mailboxes(self, account: Optional[str] = None) -> List[Mailbox]:
        """Get Gmail labels as mailboxes."""
        service = self._get_service()
        if not service:
            return []
        
        try:
            results = service.users().labels().list(userId='me').execute()
            labels = results.get('labels', [])
            
            mailboxes = []
            # Map Gmail system labels to standard names
            label_map = {
                'INBOX': 'INBOX',
                'SENT': 'Sent',
                'DRAFT': 'Drafts',
                'TRASH': 'Trash',
                'SPAM': 'Spam',
            }
            
            for label in labels:
                label_id = label['id']
                label_name = label_map.get(label_id, label.get('name', label_id))
                
                # Get unread count
                try:
                    label_info = service.users().labels().get(
                        userId='me', id=label_id
                    ).execute()
                    unread = label_info.get('messagesUnread', 0)
                    total = label_info.get('messagesTotal', 0)
                except Exception:
                    unread = 0
                    total = 0
                
                mailboxes.append(Mailbox(
                    id=label_id,
                    name=label_name,
                    account=account or 'Gmail',
                    unread_count=unread,
                    total_count=total,
                    provider=ProviderType.GMAIL,
                ))
            
            return mailboxes
            
        except Exception as e:
            logger.error(f"Failed to get Gmail labels: {e}")
            return []
    
    def get_messages(
        self,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        unread_only: bool = False,
    ) -> List[EmailMessage]:
        """Get messages from Gmail."""
        service = self._get_service()
        if not service:
            return []
        
        try:
            # Build query
            query = f'in:{mailbox}'
            if unread_only:
                query += ' is:unread'
            
            results = service.users().messages().list(
                userId='me',
                q=query,
                maxResults=limit,
            ).execute()
            
            messages = []
            for msg_data in results.get('messages', []):
                msg = self._fetch_message_headers(service, msg_data['id'], mailbox, account)
                if msg:
                    messages.append(msg)
            
            return messages
            
        except Exception as e:
            logger.error(f"Failed to get Gmail messages: {e}")
            return []
    
    def _fetch_message_headers(
        self, service, msg_id: str, mailbox: str, account: Optional[str]
    ) -> Optional[EmailMessage]:
        """Fetch message headers (not full content)."""
        try:
            msg = service.users().messages().get(
                userId='me',
                id=msg_id,
                format='metadata',
                metadataHeaders=['From', 'To', 'Subject', 'Date'],
            ).execute()
            
            headers = {h['name']: h['value'] for h in msg.get('payload', {}).get('headers', [])}
            
            # Parse sender
            sender_raw = headers.get('From', '')
            sender_email = sender_raw
            sender_name = None
            if '<' in sender_raw and '>' in sender_raw:
                sender_name = sender_raw.split('<')[0].strip().strip('"')
                sender_email = sender_raw.split('<')[1].replace('>', '').strip()
            
            # Check read/unread
            labels = msg.get('labelIds', [])
            is_read = 'UNREAD' not in labels
            is_flagged = 'STARRED' in labels
            
            return EmailMessage(
                id=msg_id,
                subject=headers.get('Subject', '(no subject)'),
                sender=sender_email,
                sender_name=sender_name,
                recipients=[],
                cc=[],
                bcc=[],
                date_received=headers.get('Date', ''),
                date_sent=None,
                is_read=is_read,
                is_flagged=is_flagged,
                mailbox=mailbox,
                account=account or 'Gmail',
                provider=ProviderType.GMAIL,
                snippet=msg.get('snippet', ''),
                thread_id=msg.get('threadId'),
                labels=labels,
            )
            
        except Exception as e:
            logger.warning(f"Failed to fetch message {msg_id}: {e}")
            return None
    
    def get_message(
        self,
        message_id: str,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> Optional[EmailMessage]:
        """Get full message content."""
        service = self._get_service()
        if not service:
            return None
        
        try:
            msg = service.users().messages().get(
                userId='me',
                id=message_id,
                format='full',
            ).execute()
            
            headers = {h['name']: h['value'] for h in msg.get('payload', {}).get('headers', [])}
            
            # Parse sender
            sender_raw = headers.get('From', '')
            sender_email = sender_raw
            sender_name = None
            if '<' in sender_raw and '>' in sender_raw:
                sender_name = sender_raw.split('<')[0].strip().strip('"')
                sender_email = sender_raw.split('<')[1].replace('>', '').strip()
            
            # Parse recipients
            to_raw = headers.get('To', '')
            recipients = [r.strip() for r in to_raw.split(',') if r.strip()]
            
            # Get body
            content = self._extract_body(msg.get('payload', {}))
            
            # Check read/unread
            labels = msg.get('labelIds', [])
            is_read = 'UNREAD' not in labels
            is_flagged = 'STARRED' in labels
            
            return EmailMessage(
                id=message_id,
                subject=headers.get('Subject', '(no subject)'),
                sender=sender_email,
                sender_name=sender_name,
                recipients=recipients,
                cc=[],
                bcc=[],
                date_received=headers.get('Date', ''),
                date_sent=None,
                is_read=is_read,
                is_flagged=is_flagged,
                mailbox=mailbox,
                account=account or 'Gmail',
                provider=ProviderType.GMAIL,
                content=content,
                snippet=msg.get('snippet', ''),
                thread_id=msg.get('threadId'),
                labels=labels,
            )
            
        except Exception as e:
            logger.error(f"Failed to get Gmail message: {e}")
            return None
    
    def _extract_body(self, payload: Dict[str, Any]) -> str:
        """Extract message body from Gmail payload."""
        # Check for simple body
        if 'body' in payload and payload['body'].get('data'):
            return base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='replace')
        
        # Check for multipart
        if 'parts' in payload:
            for part in payload['parts']:
                mime_type = part.get('mimeType', '')
                if mime_type == 'text/plain':
                    if part.get('body', {}).get('data'):
                        return base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='replace')
                elif mime_type.startswith('multipart/'):
                    # Recurse into nested multipart
                    result = self._extract_body(part)
                    if result:
                        return result
        
        return ''
    
    def search(
        self,
        query: str,
        mailbox: Optional[str] = None,
        account: Optional[str] = None,
        limit: int = 20,
    ) -> List[EmailMessage]:
        """Search Gmail with Gmail's query syntax."""
        service = self._get_service()
        if not service:
            return []
        
        try:
            # Gmail search supports its full query syntax
            full_query = query
            if mailbox:
                full_query = f'in:{mailbox} {query}'
            
            results = service.users().messages().list(
                userId='me',
                q=full_query,
                maxResults=limit,
            ).execute()
            
            messages = []
            for msg_data in results.get('messages', []):
                msg = self._fetch_message_headers(service, msg_data['id'], mailbox or 'INBOX', account)
                if msg:
                    messages.append(msg)
            
            return messages
            
        except Exception as e:
            logger.error(f"Gmail search failed: {e}")
            return []
    
    def create_draft(self, draft: DraftMessage, account: Optional[str] = None) -> bool:
        """Create a draft in Gmail and open it in browser.
        
        Creates the draft via Gmail API, then opens it in the user's
        default browser for immediate review.
        """
        service = self._get_service()
        if not service:
            return False

        try:
            # Build the email
            message = MIMEText(draft.content)
            message['to'] = ', '.join(draft.to)
            message['subject'] = draft.subject

            if draft.cc:
                message['cc'] = ', '.join(draft.cc)
            if draft.bcc:
                message['bcc'] = ', '.join(draft.bcc)

            # Encode
            raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')

            # Create draft and get the draft ID
            result = service.users().drafts().create(
                userId='me',
                body={'message': {'raw': raw}}
            ).execute()
            
            draft_id = result.get('id')
            
            # Open draft in browser for immediate review
            if draft_id:
                import webbrowser
                # Gmail draft URL format
                draft_url = f"https://mail.google.com/mail/u/0/#drafts?compose={draft_id}"
                webbrowser.open(draft_url)
                logger.info(f"Created Gmail draft and opened in browser: {draft_id}")

            return True

        except Exception as e:
            logger.error(f"Failed to create Gmail draft: {e}")
            return False

    def send_message(
        self,
        account_id: str,
        to: List[str],
        subject: str,
        content: str,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        html: bool = True,
    ) -> Dict[str, Any]:
        """Send an email directly via Gmail API.

        This requires the gmail.send scope.
        ONLY use this for Claude's autonomous account.
        For user's accounts, use create_draft() instead.

        Args:
            account_id: Account ID (not used for Gmail, here for interface compatibility)
            to: Recipient email addresses
            subject: Email subject
            content: Email content (HTML or plain text)
            cc: CC recipients
            bcc: BCC recipients
            html: Whether content is HTML (default True)

        Returns:
            Dict with:
            - success: Whether sending succeeded
            - message_id: Gmail message ID if successful
            - error: Error message if failed
        """
        service = self._get_service()
        if not service:
            return {
                "success": False,
                "error": "Gmail service not available. Check credentials.",
            }

        try:
            # Build the email
            if html:
                from email.mime.multipart import MIMEMultipart
                from email.mime.text import MIMEText as MIMETextClass

                message = MIMEMultipart('alternative')
                # Add plain text fallback
                plain_text = content  # TODO: Convert HTML to plain text
                message.attach(MIMETextClass(plain_text, 'plain'))
                message.attach(MIMETextClass(content, 'html'))
            else:
                message = MIMEText(content)

            message['to'] = ', '.join(to)
            message['subject'] = subject

            if cc:
                message['cc'] = ', '.join(cc)
            if bcc:
                message['bcc'] = ', '.join(bcc)

            # Encode
            raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')

            # Send
            result = service.users().messages().send(
                userId='me',
                body={'raw': raw}
            ).execute()

            message_id = result.get('id')
            logger.info(f"Sent email to {to} - message ID: {message_id}")

            return {
                "success": True,
                "message_id": message_id,
            }

        except Exception as e:
            logger.error(f"Failed to send Gmail: {e}")
            return {
                "success": False,
                "error": str(e),
            }
    
    def mark_read(
        self,
        message_id: str,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> bool:
        """Mark a message as read."""
        service = self._get_service()
        if not service:
            return False
        
        try:
            service.users().messages().modify(
                userId='me',
                id=message_id,
                body={'removeLabelIds': ['UNREAD']}
            ).execute()
            return True
        except Exception as e:
            logger.error(f"Failed to mark read: {e}")
            return False
    
    def mark_flagged(
        self,
        message_id: str,
        flagged: bool,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> bool:
        """Star/unstar a message."""
        service = self._get_service()
        if not service:
            return False
        
        try:
            if flagged:
                body = {'addLabelIds': ['STARRED']}
            else:
                body = {'removeLabelIds': ['STARRED']}
            
            service.users().messages().modify(
                userId='me',
                id=message_id,
                body=body
            ).execute()
            return True
        except Exception as e:
            logger.error(f"Failed to modify star: {e}")
            return False
    
    def delete(
        self,
        message_id: str,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> bool:
        """Move to trash."""
        service = self._get_service()
        if not service:
            return False
        
        try:
            service.users().messages().trash(
                userId='me',
                id=message_id
            ).execute()
            return True
        except Exception as e:
            logger.error(f"Failed to trash message: {e}")
            return False
    
    def get_unread_count(self, mailbox: str = "INBOX", account: Optional[str] = None) -> int:
        """Get unread count for a label."""
        service = self._get_service()
        if not service:
            return 0
        
        try:
            # Map standard names to Gmail labels
            label_id = mailbox.upper()
            if mailbox == 'Sent':
                label_id = 'SENT'
            elif mailbox == 'Drafts':
                label_id = 'DRAFT'
            elif mailbox == 'Trash':
                label_id = 'TRASH'
            
            label_info = service.users().labels().get(
                userId='me', id=label_id
            ).execute()
            return label_info.get('messagesUnread', 0)
        except Exception as e:
            logger.warning(f"Failed to get unread count: {e}")
            return 0
    
    def test_connection(self) -> tuple[bool, str]:
        """Test Gmail connection."""
        if not self._config:
            return False, "Gmail not configured. Add OAuth2 credentials in Settings."
        
        service = self._get_service()
        if not service:
            return False, "Failed to initialize Gmail service. Check credentials."
        
        try:
            profile = service.users().getProfile(userId='me').execute()
            email = profile.get('emailAddress', 'unknown')
            return True, f"Connected as {email}"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"


# === OAuth2 Helper for Initial Setup ===

def get_authorization_url(client_id: str, client_secret: str, redirect_uri: str = 'urn:ietf:wg:oauth:2.0:oob') -> str:
    """Get the OAuth2 authorization URL for user consent.
    
    This is used during initial setup to get user authorization.
    
    Args:
        client_id: Google OAuth2 client ID
        client_secret: Google OAuth2 client secret
        redirect_uri: Redirect URI (use OOB for desktop apps)
        
    Returns:
        URL to open in browser for user authorization
    """
    from urllib.parse import urlencode
    
    params = {
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': ' '.join(SCOPES),
        'access_type': 'offline',
        'prompt': 'consent',
    }
    
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def exchange_code_for_tokens(
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str = 'urn:ietf:wg:oauth:2.0:oob'
) -> Dict[str, str]:
    """Exchange authorization code for tokens.
    
    Args:
        code: Authorization code from user consent
        client_id: Google OAuth2 client ID
        client_secret: Google OAuth2 client secret
        redirect_uri: Same redirect URI used in authorization
        
    Returns:
        Dict with access_token, refresh_token, etc.
    """
    import requests
    
    response = requests.post('https://oauth2.googleapis.com/token', data={
        'code': code,
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code',
    })
    
    return response.json()

