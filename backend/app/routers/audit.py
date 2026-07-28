from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from app.database import get_db
from app.models import User, AuditLog
from app.auth import require_role

router = APIRouter()


@router.get("/logs")
async def get_audit_logs(
    page:   int            = Query(1,   ge=1),
    limit:  int            = Query(100, ge=1, le=1000),
    action: Optional[str]  = Query(None, description="Filter by action keyword"),
    db:     Session        = Depends(get_db),
    _:      User           = Depends(require_role(["admin"])),
):
    query = db.query(AuditLog).options(joinedload(AuditLog.user))
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))

    total = query.count()
    logs  = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "logs": [
            {
                "id":         str(log.id),
                "username":   log.user.username if log.user else None,
                "action":     log.action,
                "details":    log.details,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ],
    }
