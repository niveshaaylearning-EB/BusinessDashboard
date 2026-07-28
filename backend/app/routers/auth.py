import re
from datetime import datetime, timedelta
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, AuditLog, RevokedToken, PendingOTP
from app.schemas import (
    LoginRequest, TokenResponse, UserOut, PasswordChangeRequest,
    RegisterSendOTPRequest, RegisterVerifyRequest,
    LoginChallengeResponse, VerifyLoginOTPRequest,
)
from app.auth import (
    create_access_token, get_current_user, get_password_hash,
    revoke_token, generate_otp, verify_otp_hash,
    create_login_challenge_token, decode_login_challenge_token,
)
from app.email_service import send_otp_email, mask_email
from app.limiter import limiter

router  = APIRouter()
_bearer = HTTPBearer()

OTP_EXPIRY_REGISTER = 10  # minutes
OTP_EXPIRY_LOGIN    = 5   # minutes
OTP_MAX_ATTEMPTS    = 3


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _derive_username(email: str, db: Session) -> str:
    """Auto-generate username from email prefix, appending a number if taken."""
    base = email.split("@")[0]
    username = base
    suffix = 1
    while db.query(User).filter(User.username == username).first():
        username = f"{base}{suffix}"
        suffix += 1
    return username


def _clean_expired_otps(email: str, purpose: str, db: Session) -> None:
    """Lazily remove expired/used OTPs for this email+purpose."""
    db.query(PendingOTP).filter(
        PendingOTP.email   == email,
        PendingOTP.purpose == purpose,
    ).delete()
    db.flush()


# ── Registration ──────────────────────────────────────────────────────────────

@router.post("/register/send-otp", status_code=200)
@limiter.limit("3/minute")
async def register_send_otp(
    request: Request,
    body: RegisterSendOTPRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Step 1 of registration: validate details, send OTP to the Niveshaay email."""

    email = body.email.strip().lower()

    # Email already registered?
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "An account with this email already exists. Please sign in.")

    # Check username availability
    username = _derive_username(email, db)

    # Remove old OTPs for this email
    _clean_expired_otps(email, "register", db)

    otp, otp_hash = generate_otp()
    expires_at    = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_REGISTER)

    # Store hashed password and profile in meta — never store plain password
    pending = PendingOTP(
        email      = email,
        otp_hash   = otp_hash,
        purpose    = "register",
        expires_at = expires_at,
        meta       = {
            "first_name":       body.first_name.strip(),
            "last_name":        body.last_name.strip(),
            "mobile":           body.mobile,
            "hashed_password":  get_password_hash(body.password),
            "username":         username,
        },
    )
    db.add(pending)
    db.commit()

    to_name = f"{body.first_name.strip()} {body.last_name.strip()}"
    background_tasks.add_task(send_otp_email, email, to_name, otp, "register")

    return {"message": f"OTP sent to {mask_email(email)}. Valid for {OTP_EXPIRY_REGISTER} minutes."}


@router.post("/register/verify", status_code=201)
@limiter.limit("5/minute")
async def register_verify(
    request: Request,
    body: RegisterVerifyRequest,
    db: Session = Depends(get_db),
):
    """Step 2 of registration: verify OTP and create account."""

    email = body.email.strip().lower()
    otp   = body.otp.strip()

    pending = (
        db.query(PendingOTP)
        .filter(
            PendingOTP.email   == email,
            PendingOTP.purpose == "register",
            PendingOTP.used    == False,
        )
        .order_by(PendingOTP.created_at.desc())
        .first()
    )

    if not pending:
        raise HTTPException(400, "No active OTP found for this email. Please request a new one.")

    if pending.expires_at < datetime.utcnow():
        db.delete(pending)
        db.commit()
        raise HTTPException(400, "OTP has expired. Please request a new one.")

    pending.attempts += 1
    if pending.attempts > OTP_MAX_ATTEMPTS:
        db.delete(pending)
        db.commit()
        raise HTTPException(400, "Too many incorrect attempts. Please request a new OTP.")

    if not verify_otp_hash(otp, pending.otp_hash):
        db.commit()
        remaining = OTP_MAX_ATTEMPTS - pending.attempts
        raise HTTPException(400, f"Incorrect OTP. {remaining} attempt(s) remaining.")

    # OTP valid — create user
    meta     = pending.meta or {}
    username = meta.get("username") or _derive_username(email, db)

    # Guard against race condition: email registered between send-otp and verify
    if db.query(User).filter(User.email == email).first():
        db.delete(pending)
        db.commit()
        raise HTTPException(409, "An account with this email already exists.")

    user = User(
        username        = username,
        email           = email,
        full_name       = f"{meta.get('first_name', '')} {meta.get('last_name', '')}".strip(),
        mobile          = meta.get("mobile"),
        hashed_password = meta["hashed_password"],
        role            = "viewer",
        is_active       = False,  # requires admin approval before first login
    )
    db.add(user)

    pending.used = True
    db.add(AuditLog(
        user_id=user.id, action="register",
        ip_address=_ip(request), user_agent=request.headers.get("user-agent"),
    ))
    db.commit()

    return {
        "message":  "Account created! Your request is pending admin approval. You'll be notified once access is granted.",
        "username": username,
    }


# ── Login: email/username → OTP challenge (no password) ──────────────────────

@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    identifier = body.username.strip()
    user = db.query(User).filter(User.username == identifier).first()
    if not user:
        user = db.query(User).filter(User.email == identifier.lower()).first()

    if not user or not user.is_active:
        raise HTTPException(401, "No active account found. Contact your administrator.")

    if not user.email:
        raise HTTPException(400, "No email on file for this account. Contact your administrator.")

    _clean_expired_otps(user.email, "login", db)

    otp, otp_hash = generate_otp()
    expires_at    = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_LOGIN)

    db.add(PendingOTP(
        email      = user.email,
        otp_hash   = otp_hash,
        purpose    = "login",
        user_id    = user.id,
        expires_at = expires_at,
    ))
    db.commit()

    temp_token = create_login_challenge_token(str(user.id))
    background_tasks.add_task(send_otp_email, user.email, user.full_name or user.username, otp, "login")

    return LoginChallengeResponse(
        requires_otp=True,
        masked_email=mask_email(user.email),
        temp_token=temp_token,
    )


# ── Login (step 2: OTP → real JWT) ───────────────────────────────────────────

@router.post("/verify-login-otp", response_model=TokenResponse)
@limiter.limit("10/minute")
async def verify_login_otp(
    request: Request,
    body: VerifyLoginOTPRequest,
    db: Session = Depends(get_db),
):
    user_id = decode_login_challenge_token(body.temp_token)

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(401, "User not found or account is deactivated")

    pending = (
        db.query(PendingOTP)
        .filter(
            PendingOTP.user_id == user_id,
            PendingOTP.purpose == "login",
            PendingOTP.used    == False,
        )
        .order_by(PendingOTP.created_at.desc())
        .first()
    )

    if not pending:
        raise HTTPException(400, "No active login OTP found. Please sign in again.")

    if pending.expires_at < datetime.utcnow():
        db.delete(pending)
        db.commit()
        raise HTTPException(400, "OTP has expired. Please sign in again.")

    pending.attempts += 1
    if pending.attempts > OTP_MAX_ATTEMPTS:
        db.delete(pending)
        db.commit()
        raise HTTPException(400, "Too many incorrect attempts. Please sign in again.")

    if not verify_otp_hash(body.otp.strip(), pending.otp_hash):
        db.commit()
        remaining = OTP_MAX_ATTEMPTS - pending.attempts
        raise HTTPException(400, f"Incorrect OTP. {remaining} attempt(s) remaining.")

    # OTP valid — issue real access token
    pending.used            = True
    user.failed_login_count = 0
    user.locked_until       = None
    user.last_login         = datetime.utcnow()

    token = create_access_token({
        "sub":      str(user.id),
        "username": user.username,
        "role":     user.role,
    })

    db.add(AuditLog(
        user_id=user.id, action="login",
        ip_address=_ip(request), user_agent=request.headers.get("user-agent"),
    ))
    db.commit()
    db.refresh(user)

    return {"access_token": token, "token_type": "bearer", "user": UserOut.model_validate(user)}


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
):
    """Revoke the submitted token. Always returns 200 — even if the token is
    already expired or was issued before the purpose-check was introduced.
    The client always gets a clean logout regardless of token state.
    """
    from jose import jwt as _jwt, JWTError
    from app.config import settings as _settings
    user_id = None
    try:
        payload = _jwt.decode(credentials.credentials, _settings.secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        revoke_token(credentials.credentials, db)
    except JWTError:
        pass  # expired or malformed — nothing to revoke, but logout still succeeds

    if user_id:
        db.add(AuditLog(user_id=user_id, action="logout", ip_address=_ip(request)))
        db.commit()

    return {"message": "Logged out"}


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.put("/me/password")
async def change_my_password(
    request: Request,
    body: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.hashed_password = get_password_hash(body.password)
    db.add(AuditLog(
        user_id=current_user.id, action="password_changed",
        ip_address=_ip(request), user_agent=request.headers.get("user-agent"),
    ))
    db.commit()
    return {"message": "Password changed successfully"}
