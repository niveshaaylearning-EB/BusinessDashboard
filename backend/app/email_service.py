import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

BREVO_URL = "https://api.brevo.com/v3/smtp/email"


def mask_email(email: str) -> str:
    local, domain = email.split("@", 1)
    masked = local[0] + "*" * max(1, len(local) - 1)
    return f"{masked}@{domain}"


async def send_otp_email(to_email: str, to_name: str, otp: str, purpose: str) -> None:
    """Send OTP to `to_email` via Brevo. purpose: 'register' | 'login'"""

    if purpose == "register":
        subject = "NIA Antigravity — Email Verification OTP"
        accent  = "#00d4ff"
        heading = "Verify your email to complete registration"
        body    = "Enter the OTP below to verify your Niveshaay email and activate your account:"
        expiry  = "10 minutes"
        note    = "Do not share this code with anyone. If you did not request this, ignore this email."
    else:
        subject = "NIA Antigravity — Login Verification Code"
        accent  = "#fbbf24"
        heading = "Two-factor authentication required"
        body    = "A login attempt was detected for your account. Use this code to complete sign-in:"
        expiry  = "5 minutes"
        note    = "If this was not you, contact your administrator immediately and change your password."

    html = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111111;">
  <div style="max-width:480px;margin:40px auto;padding:0 16px;">
    <p style="font-size:14px;margin-bottom:4px;"><strong>NIA Antigravity</strong> &nbsp;·&nbsp; Niveshaay Investment Advisors</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0 24px;">
    <p style="font-size:15px;margin:0 0 8px;">Hi {to_name},</p>
    <p style="font-size:14px;color:#374151;margin:0 0 28px;">{body}</p>
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:42px;font-weight:700;letter-spacing:10px;color:#111111;font-family:monospace;">{otp}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:10px;">Valid for <strong>{expiry}</strong> &nbsp;·&nbsp; one-time use only</div>
    </div>
    <p style="font-size:12px;color:#9ca3af;margin:0;">{note}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">
    <p style="font-size:11px;color:#d1d5db;margin:0;">Do not reply to this email.</p>
  </div>
</body>
</html>"""

    payload = {
        "sender": {"name": settings.from_name, "email": settings.from_email},
        "to":     [{"email": to_email, "name": to_name}],
        "subject": subject,
        "htmlContent": html,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            BREVO_URL,
            headers={
                "api-key":      settings.brevo_api_key,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10.0,
        )

    if resp.status_code not in (200, 201, 202):
        logger.error("OTP email delivery failed to %s | status=%s | body=%s", to_email, resp.status_code, resp.text[:300])
        raise RuntimeError(f"Email delivery failed ({resp.status_code}): {resp.text[:300]}")
