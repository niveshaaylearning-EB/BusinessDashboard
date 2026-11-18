import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

DOUBLETICK_URL = "https://public.doubletick.io/whatsapp/message/template"


def whatsapp_enabled() -> bool:
    return bool(settings.doubletick_api_key)


def mask_phone(phone: str) -> str:
    return f"••••{phone[-4:]}"


async def send_whatsapp_otp(to_phone: str, otp: str) -> None:
    """Send OTP to `to_phone` (E.164) via a DoubleTick WhatsApp template. Raises on failure."""
    if not whatsapp_enabled():
        raise RuntimeError("WhatsApp is not configured (DOUBLETICK_API_KEY missing)")

    payload = {"messages": [{
        "from": settings.doubletick_from_number,
        "to":   to_phone,
        "content": {
            "templateName": settings.whatsapp_otp_template,
            "language":     "en",
            "templateData": {
                "body":    {"placeholders": [otp]},
                "buttons": [{"type": "URL"}],   # the template's copy-code button
            },
        },
    }]}

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            DOUBLETICK_URL,
            headers={
                "Authorization": settings.doubletick_api_key,
                "Content-Type":  "application/json",
                "Accept":        "application/json",
            },
            json=payload,
            timeout=15.0,
        )

    if resp.status_code not in (200, 201, 202):
        logger.error("WhatsApp OTP delivery failed to %s | status=%s | body=%s", to_phone, resp.status_code, resp.text[:300])
        raise RuntimeError(f"WhatsApp delivery failed ({resp.status_code})")

    status = ((resp.json().get("messages") or [{}])[0]).get("status")
    if status not in ("ENQUEUED", "SENT", "DELIVERED"):
        logger.error("WhatsApp OTP to %s not accepted | body=%s", to_phone, resp.text[:300])
        raise RuntimeError(f"WhatsApp delivery was not accepted (status: {status})")


async def send_whatsapp_otp_quietly(to_phone: str, otp: str) -> None:
    """Background-task variant: logs instead of raising, so a WhatsApp failure
    never stops the email OTP queued after it."""
    try:
        await send_whatsapp_otp(to_phone, otp)
    except Exception:
        logger.exception("WhatsApp login OTP to %s failed", to_phone)
