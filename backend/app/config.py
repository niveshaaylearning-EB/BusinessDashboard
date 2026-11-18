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

    # WhatsApp OTP (DoubleTick) — same account, sender number and approved
    # Authentication template as the PF Performance dashboard. Leave the API key
    # empty to turn WhatsApp off entirely (login falls back to email only and
    # nobody is asked to add a number).
    doubletick_api_key: str = ""
    doubletick_from_number: str = "+917859870559"
    whatsapp_otp_template: str = "otp_login_pf_dashboard"

    # Dashboard assistant (admin-only chat widget). Leave the key empty to turn
    # it off. The monthly cap is a local estimate from token counts; once this
    # month's spend reaches it, questions are refused until the 1st.
    anthropic_api_key: str = ""
    assistant_model: str = "claude-haiku-5-5"
    assistant_monthly_cap_usd: float = 15.0

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
