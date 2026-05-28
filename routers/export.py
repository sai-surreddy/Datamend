from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from models.database import get_db, Workbook, Project, Webhook
from models.schemas import ExportRequest, WebhookCreate, WebhookPushRequest
from services.export_service import run_export, deliver_webhook

router = APIRouter()


@router.post("/download")
def export_download(data: ExportRequest, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == data.workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")
    if not wb.column_mapping:
        raise HTTPException(400, "Map columns before exporting")

    project = db.query(Project).filter(Project.id == wb.project_id).first()
    schema = project.target_schema if project else []

    try:
        result = run_export(
            wb.file_path,
            wb.original_filename,
            wb.column_mapping,
            schema,
            format=data.format,
            only_valid=data.only_valid,
            include_errors=data.include_errors,
            validation_result=wb.validation_summary,
            mapped_only=data.mapped_only,
        )
    except Exception as e:
        raise HTTPException(500, f"Export failed: {str(e)}")

    wb.status = "exported"
    db.commit()

    return Response(
        content=result["data"],
        media_type=result["media_type"],
        headers={
            "Content-Disposition": f'attachment; filename="{result["filename"]}"',
            "X-Row-Count": str(result["row_count"]),
        },
    )


# ── Webhooks ──────────────────────────────────────────────────────────────────

@router.post("/webhooks")
def create_webhook(project_id: str, data: WebhookCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    wh = Webhook(
        project_id=project_id,
        name=data.name,
        url=data.url,
        secret=data.secret,
        events=data.events,
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


@router.get("/webhooks/{project_id}")
def list_webhooks(project_id: str, db: Session = Depends(get_db)):
    return db.query(Webhook).filter(Webhook.project_id == project_id).all()


@router.post("/webhooks/push")
async def push_webhook(data: WebhookPushRequest, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == data.workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")

    wh = db.query(Webhook).filter(Webhook.id == data.webhook_id).first()
    if not wh:
        raise HTTPException(404, "Webhook not found")

    payload = {
        "workbook_id": wb.id,
        "workbook_name": wb.name,
        "row_count": wb.row_count,
        "status": wb.status,
        "validation_summary": wb.validation_summary,
    }

    result = await deliver_webhook(wh.url, "export.complete", payload, wh.secret)

    from datetime import datetime
    wh.last_triggered = datetime.utcnow()
    db.commit()

    return result


@router.delete("/webhooks/{webhook_id}")
def delete_webhook(webhook_id: str, db: Session = Depends(get_db)):
    wh = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not wh:
        raise HTTPException(404, "Webhook not found")
    db.delete(wh)
    db.commit()
    return {"deleted": webhook_id}
