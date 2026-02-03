import json
import os
import shutil
import tempfile
import uuid


class CredentialsManager:
    def __init__(self):
        self.base_dir = os.path.join(tempfile.gettempdir(), "ga4-agent-credentials")
        os.makedirs(self.base_dir, exist_ok=True)

    def create_credentials_file(
        self,
        user_id: str,
        refresh_token: str,
        client_id: str,
        client_secret: str,
        purpose: str = "ga4",
    ) -> str:
        """Create a credentials file for MCP subprocess use.

        Each call creates a session-unique directory (UUID-based) to avoid
        race conditions between concurrent requests for the same user, and
        separates GA4/GSC files so GSC token refresh cannot corrupt GA4 ADC.

        Args:
            purpose: 'ga4' or 'gsc' — determines the filename so that
                     GA4 (ADC via google.auth.default) and GSC (direct file read)
                     never share the same file.
        """
        session_id = uuid.uuid4().hex[:12]
        session_dir = os.path.join(self.base_dir, f"{user_id}_{session_id}")
        os.makedirs(session_dir, exist_ok=True)

        filename = f"{purpose}_credentials.json"
        creds_path = os.path.join(session_dir, filename)

        creds = {
            "type": "authorized_user",
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
        }

        fd = os.open(creds_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(creds, f)

        return creds_path

    def cleanup_path(self, creds_path: str):
        """Remove the session directory containing the given credentials file."""
        session_dir = os.path.dirname(creds_path)
        if os.path.exists(session_dir) and session_dir.startswith(self.base_dir):
            shutil.rmtree(session_dir, ignore_errors=True)

    def cleanup_user(self, user_id: str):
        """Remove all session directories for a user (legacy compat)."""
        if not os.path.exists(self.base_dir):
            return
        for entry in os.listdir(self.base_dir):
            if entry.startswith(user_id):
                path = os.path.join(self.base_dir, entry)
                if os.path.isdir(path):
                    shutil.rmtree(path, ignore_errors=True)

    def cleanup_all(self):
        if os.path.exists(self.base_dir):
            shutil.rmtree(self.base_dir)
            os.makedirs(self.base_dir, exist_ok=True)
