from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, UploadSession, UploadData, AuditLog
from app.schemas import UploadRequest, DataResponse
from app.auth import get_current_user, require_role

router = APIRouter()

UPLOAD_ROLES = ["admin", "operations", "editor"]


@router.post("/upload")
async def upload_data(
    request: Request,
    body: UploadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UPLOAD_ROLES)),
):
    if not body.rows:
        raise HTTPException(400, "No rows provided")
    if len(body.rows) > 500_000:
        raise HTTPException(400, "Row limit exceeded (max 500,000 rows)")

    # Deactivate all previous sessions
    db.query(UploadSession).filter(UploadSession.is_active == True).update({"is_active": False})

    session = UploadSession(
        user_id=current_user.id,
        file_name=body.file_name,
        row_count=len(body.rows),
        is_active=True,
    )
    db.add(session)
    db.flush()  # get session.id before adding child

    db.add(UploadData(session_id=session.id, rows_json=body.rows))

    db.add(AuditLog(
        user_id=current_user.id,
        action="data_upload",
        details={"file_name": body.file_name, "row_count": len(body.rows)},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    ))
    db.commit()

    return {
        "session_id": str(session.id),
        "row_count": len(body.rows),
        "message": "Data uploaded successfully",
    }


@router.get("/latest", response_model=DataResponse)
async def get_latest_data(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = (
        db.query(UploadSession)
        .filter(UploadSession.is_active == True)
        .order_by(UploadSession.uploaded_at.desc())
        .first()
    )
    if not session:
        return DataResponse(rows=[], file_name="", uploaded_at=None, row_count=0)

    data_rec = db.query(UploadData).filter(UploadData.session_id == session.id).first()
    rows = data_rec.rows_json if data_rec else []

    db.add(AuditLog(
        user_id=current_user.id,
        action="data_access",
        details={"file_name": session.file_name, "row_count": session.row_count},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    ))
    db.commit()

    return DataResponse(
        rows=rows,
        file_name=session.file_name,
        uploaded_at=session.uploaded_at.isoformat(),
        row_count=session.row_count,
    )
