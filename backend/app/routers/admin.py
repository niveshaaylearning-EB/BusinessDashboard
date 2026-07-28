from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, AuditLog
from app.schemas import UserOut, CreateUserRequest, UpdateUserRequest, PasswordResetRequest
from app.auth import get_password_hash, require_role

router = APIRouter()

VALID_ROLES = {"admin", "operations", "editor", "viewer"}


@router.get("/users")
async def list_users(
    db: Session = Depends(get_db),
    _:  User    = Depends(require_role(["admin"])),
):
    users = db.query(User).order_by(User.created_at).all()
    return [UserOut.model_validate(u) for u in users]


@router.post("/users", response_model=UserOut)
async def create_user(
    request: Request,
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"Invalid role. Valid roles: {', '.join(sorted(VALID_ROLES))}")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "Username already exists")

    user = User(
        username=body.username,
        full_name=body.full_name,
        email=body.email,
        hashed_password=get_password_hash(body.password),
        role=body.role,
    )
    db.add(user)
    db.add(AuditLog(
        user_id=current_user.id,
        action="user_created",
        details={"username": body.username, "role": body.role},
        ip_address=request.client.host if request.client else None,
    ))
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if body.role and body.role not in VALID_ROLES:
        raise HTTPException(400, f"Invalid role. Valid roles: {', '.join(sorted(VALID_ROLES))}")

    changes = {}
    if body.full_name is not None and body.full_name != user.full_name:
        changes["full_name"] = body.full_name; user.full_name = body.full_name
    if body.email is not None and body.email != user.email:
        changes["email"] = body.email; user.email = body.email
    if body.role is not None and body.role != user.role:
        changes["role"] = body.role; user.role = body.role
    if body.is_active is not None and body.is_active != user.is_active:
        changes["is_active"] = body.is_active; user.is_active = body.is_active

    if changes:
        db.add(AuditLog(
            user_id=current_user.id,
            action="user_updated",
            details={"username": user.username, "changes": changes},
            ip_address=request.client.host if request.client else None,
        ))

    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.put("/users/{user_id}/password")
async def reset_password(
    user_id: str,
    body: PasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.hashed_password = get_password_hash(body.password)
    db.add(AuditLog(
        user_id=current_user.id,
        action="password_reset",
        details={"target_username": user.username},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    ))
    db.commit()
    return {"message": f"Password reset for {user.username}"}


@router.delete("/users/{user_id}/delete")
async def delete_user(
    user_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Permanently remove a user (used to reject pending registrations)."""
    if user_id == str(current_user.id):
        raise HTTPException(400, "You cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    username = user.username
    db.delete(user)
    db.add(AuditLog(
        user_id=current_user.id,
        action="user_deleted",
        details={"username": username},
        ip_address=request.client.host if request.client else None,
    ))
    db.commit()
    return {"message": f"User '{username}' has been permanently deleted"}


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    if user_id == str(current_user.id):
        raise HTTPException(400, "You cannot deactivate your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    user.is_active = False
    db.add(AuditLog(
        user_id=current_user.id,
        action="user_deactivated",
        details={"username": user.username},
        ip_address=request.client.host if request.client else None,
    ))
    db.commit()
    return {"message": f"User '{user.username}' has been deactivated"}
