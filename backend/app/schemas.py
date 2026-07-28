import re
from pydantic import BaseModel, field_validator, Field
from typing import Optional, Any, List
from datetime import datetime


def _validate_password(password: str) -> str:
    """Enforce password complexity — used by all password-setting schemas."""
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(password) > 128:
        raise ValueError("Password must not exceed 128 characters")
    if not re.search(r'[A-Z]', password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r'[0-9]', password):
        raise ValueError("Password must contain at least one digit")
    if not re.search(r'[^A-Za-z0-9]', password):
        raise ValueError("Password must contain at least one special character (!@#$% etc.)")
    return password


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)


class UserOut(BaseModel):
    id:         str
    username:   str
    email:      Optional[str] = None
    full_name:  Optional[str] = None
    role:       str
    is_active:  bool
    created_at: datetime
    last_login: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserOut


class UploadRequest(BaseModel):
    rows:      List[Any] = Field(..., max_length=500_000)
    file_name: str       = Field(..., min_length=1, max_length=500)


class DataResponse(BaseModel):
    rows:        List[Any]
    file_name:   str
    uploaded_at: Optional[str] = None
    row_count:   int


class CreateUserRequest(BaseModel):
    username:  str           = Field(..., min_length=3, max_length=50)
    password:  str
    full_name: Optional[str] = Field(None, max_length=255)
    email:     Optional[str] = Field(None, max_length=255)
    role:      str           = "viewer"

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v):
        return _validate_password(v)


class UpdateUserRequest(BaseModel):
    full_name: Optional[str]  = Field(None, max_length=255)
    email:     Optional[str]  = Field(None, max_length=255)
    role:      Optional[str]  = None
    is_active: Optional[bool] = None


class PasswordChangeRequest(BaseModel):
    """Used by /auth/me/password — user changing their own password."""
    password: str

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v):
        return _validate_password(v)


class PasswordResetRequest(BaseModel):
    """Used by /admin/users/{id}/password — admin resetting another user's password."""
    password: str

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v):
        return _validate_password(v)


class AuditLogOut(BaseModel):
    id:         str
    username:   Optional[str] = None
    action:     str
    details:    Optional[Any] = None
    ip_address: Optional[str] = None
    created_at: str


# ── Registration + OTP schemas ────────────────────────────────────────────────

class RegisterSendOTPRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name:  str = Field(..., min_length=1, max_length=50)
    email:      str = Field(..., max_length=255)
    mobile:     str
    password:   str

    @field_validator("email")
    @classmethod
    def must_be_niveshaay(cls, v: str) -> str:
        v = v.strip().lower()
        if not v.endswith("@niveshaay.com"):
            raise ValueError("Only @niveshaay.com email addresses may register")
        return v

    @field_validator("mobile")
    @classmethod
    def must_be_10_digits(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v.strip())
        if len(digits) != 10:
            raise ValueError("Mobile number must be exactly 10 digits")
        return digits

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _validate_password(v)


class RegisterVerifyRequest(BaseModel):
    email: str = Field(..., max_length=255)
    otp:   str = Field(..., min_length=6, max_length=6)


class LoginChallengeResponse(BaseModel):
    requires_otp: bool = True
    masked_email: str
    temp_token:   str


class VerifyLoginOTPRequest(BaseModel):
    temp_token: str
    otp:        str = Field(..., min_length=6, max_length=6)
