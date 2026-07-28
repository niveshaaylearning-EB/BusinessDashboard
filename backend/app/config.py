from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    database_url: str = ""
    secret_key: str = ""
    access_token_expire_minutes: int = 480
    allowed_origins: List[str] = ["http://localhost:5173"]
    environment: str = "development"

    # Initial admin credentials (only used by setup_db.py)
    admin_username: str = "admin"
    admin_password: str = ""
    admin_name: str = "Administrator"
    admin_email: str = "admin@niveshaay.com"

    # Email (Brevo API)
    brevo_api_key: str = ""
    from_email: str = "communication@niveshaay.com"
    from_name: str = "NIA Antigravity"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
