import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base


def _uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id               = Column(String(36), primary_key=True, default=_uuid)
    username         = Column(String(50),  unique=True, nullable=False, index=True)
    email            = Column(String(255), unique=True, nullable=True)
    full_name        = Column(String(255), nullable=True)
    hashed_password  = Column(String(255), nullable=False)
    # Roles: admin | operations | editor | viewer
    role             = Column(String(20),  nullable=False, default="viewer")
    is_active        = Column(Boolean,     default=True,   nullable=False)
    created_at       = Column(DateTime,    default=datetime.utcnow, nullable=False)
    last_login       = Column(DateTime,    nullable=True)

    mobile = Column(String(15), nullable=True)

    # Brute-force lockout: lock account for 15 min after 5 consecutive failures
    failed_login_count = Column(Integer,  default=0,    nullable=False)
    locked_until       = Column(DateTime, nullable=True)

    upload_sessions = relationship("UploadSession", back_populates="user")
    audit_logs      = relationship("AuditLog",       back_populates="user")


class UploadSession(Base):
    __tablename__ = "upload_sessions"

    id          = Column(String(36), primary_key=True, default=_uuid)
    user_id     = Column(String(36), ForeignKey("users.id"), nullable=False)
    file_name   = Column(String(500), nullable=False)
    row_count   = Column(Integer,     nullable=False)
    is_active   = Column(Boolean,     default=True,  nullable=False)
    uploaded_at = Column(DateTime,    default=datetime.utcnow, nullable=False)

    user = relationship("User",       back_populates="upload_sessions")
    data = relationship("UploadData", back_populates="session", uselist=False)


class UploadData(Base):
    __tablename__ = "upload_data"

    id         = Column(String(36), primary_key=True, default=_uuid)
    session_id = Column(String(36), ForeignKey("upload_sessions.id"), unique=True, nullable=False)
    rows_json  = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    session = relationship("UploadSession", back_populates="data")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id         = Column(String(36), primary_key=True, default=_uuid)
    user_id    = Column(String(36), ForeignKey("users.id"), nullable=True)
    action     = Column(String(100), nullable=False, index=True)
    details    = Column(JSON,        nullable=True)
    ip_address = Column(String(50),  nullable=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime,    default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User", back_populates="audit_logs")


class RevokedToken(Base):
    """Stores JWT IDs (jti) that have been explicitly revoked (logout).
    Checked on every authenticated request. Expired entries can be purged safely.
    """
    __tablename__ = "revoked_tokens"

    jti        = Column(String(36), primary_key=True)   # UUID matching the JWT jti claim
    user_id    = Column(String(36), nullable=True)
    revoked_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)  # mirrors JWT exp — for cleanup


class PendingOTP(Base):
    """One-time passwords for registration email verification and login 2FA.
    Expired rows can be purged safely — they are checked lazily on each request.
    """
    __tablename__ = "pending_otps"

    id         = Column(String(36), primary_key=True, default=_uuid)
    email      = Column(String(255), nullable=False, index=True)
    otp_hash   = Column(String(64),  nullable=False)           # SHA-256 hex of the 6-digit code
    purpose    = Column(String(20),  nullable=False)           # 'register' | 'login'
    user_id    = Column(String(36),  nullable=True)    # set for login OTPs
    meta       = Column(JSON,        nullable=True)            # registration: stores hashed user data
    expires_at = Column(DateTime,    nullable=False, index=True)
    used       = Column(Boolean,     default=False, nullable=False)
    attempts   = Column(Integer,     default=0,     nullable=False)
    created_at = Column(DateTime,    default=datetime.utcnow, nullable=False)
