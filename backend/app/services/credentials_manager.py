import json
import os
import shutil
import tempfile


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
        quota_project_id: str = "",
    ) -> str:
        user_dir = os.path.join(self.base_dir, user_id)
        os.makedirs(user_dir, exist_ok=True)
        creds_path = os.path.join(user_dir, "credentials.json")

        creds = {
            "type": "authorized_user",
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "quota_project_id": quota_project_id,
        }

        fd = os.open(creds_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(creds, f)

        return creds_path

    def cleanup_user(self, user_id: str):
        user_dir = os.path.join(self.base_dir, user_id)
        if os.path.exists(user_dir):
            shutil.rmtree(user_dir)

    def cleanup_all(self):
        if os.path.exists(self.base_dir):
            shutil.rmtree(self.base_dir)
            os.makedirs(self.base_dir, exist_ok=True)
