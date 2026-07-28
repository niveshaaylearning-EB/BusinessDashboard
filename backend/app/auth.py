import uuid
import secrets
import hashlib
from datetime import datetime, timedelta
import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import User, RevokedToken

bearer_scheme = HTTPBearer()


# ── Password helpers ──────────────────────────────────────────────────────────

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── OTP helpers ───────────────────────────────────────────────────────────────

def generate_otp() -> tuple[str, str]:
    """Returns (6-digit OTP string, SHA-256 hex hash of OTP)."""
    otp = "".join(str(secrets.randbelow(10)) for _ in range(6))
    return otp, hashlib.sha256(otp.encode()).hexdigest()


def verify_otp_hash(plain_otp: str, stored_hash: str) -> bool:
    return hashlib.sha256(plain_otp.encode()).hexdigest() == stored_hash


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    """Full access token — valid for access_token_expire_minutes."""
    expires = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        **data,
        "purpose": "access",          # guards against temp_token being used as access token
        "exp": expires,
        "iat": datetime.utcnow(),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def create_login_challenge_token(user_id: str) -> str:
    """Short-lived token returned after successful password check.
    Proves credentials are valid; OTP must still be verified before a real JWT is issued.
    """
    expires = datetime.utcnow() + timedelta(minutes=10)
    payload = {
        "sub":     user_id,
        "purpose": "login_otp_pending",
        "exp":     expires,
        "iat":     datetime.utcnow(),
        "jti":     str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_login_challenge_token(token: str) -> str:
    """Decode a login challenge token. Returns user_id or raises HTTPException."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Verification session expired — please log in again")
    if payload.get("purpose") != "login_otp_pending":
        raise HTTPException(401, "Invalid verification token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid verification token payload")
    return user_id


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=["HS256"])
        user_id: str = payload.get("sub")
        jti:     str = payload.get("jti")
        if not user_id or not jti:
            raise HTTPException(401, "Invalid token payload")
        # Reject challenge tokens — they cannot grant API access
        if payload.get("purpose") != "access":
            raise HTTPException(401, "Token is not an access token")
    except JWTError:
        raise HTTPException(401, "Token is invalid or has expired")

    if db.query(RevokedToken).filter(RevokedToken.jti == jti).first():
        raise HTTPException(401, "Token has been revoked — please log in again")

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(401, "User not found or account is deactivated")
    return user


def revoke_token(token_str: str, db: Session) -> None:
    """Add a JWT's jti to the revoked_tokens table. Called on logout."""
    try:
        payload = jwt.decode(token_str, settings.secret_key, algorithms=["HS256"])
        jti        = payload.get("jti")
        user_id    = payload.get("sub")
        expires_at = datetime.utcfromtimestamp(payload.get("exp", 0))
        if jti:
            db.merge(RevokedToken(jti=jti, user_id=user_id, expires_at=expires_at))
            db.commit()
    except JWTError:
        pass


def require_role(allowed_roles: list):
    """Return a FastAPI dependency that enforces one of the given roles."""
    def _checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                403,
                f"Action requires one of these roles: {', '.join(allowed_roles)}. "
                f"Your role: {current_user.role}"
            )
        return current_user
    return _checker
