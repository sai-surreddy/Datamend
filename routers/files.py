from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
import uuid

from models.database import get_db, Project, Workbook
from models.schemas import DataPreviewRequest
from services.parser import save_upload, parse_file, load_workbook_df, get_file_ext
from services.transformer import get_data_page
from config import settings

router = APIRouter()

ALLOWED_EXTENSIONS = {"csv", "tsv", "xlsx", "xls", "json"}
MAX_BYTES = settings.MAX_FILE_SIZE_MB * 1024 * 1024


@router.post("/upload")
async def upload_file(
    project_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Validate project
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Validate file type
    ext = get_file_ext(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    # Read and size-check
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(413, f"File too large. Max size: {settings.MAX_FILE_SIZE_MB}MB")

    # Save to disk
    workbook_id = str(uuid.uuid4())
    file_path = save_upload(content, file.filename, workbook_id)

    # Parse with Pandas
    try:
        parse_result = parse_file(file_path, file.filename)
    except Exception as e:
        raise HTTPException(422, f"Could not parse file: {str(e)}")

    # Create workbook record
    workbook = Workbook(
        id=workbook_id,
        project_id=project_id,
        name=file.filename,
        original_filename=file.filename,
        file_path=file_path,
        file_type=ext,
        row_count=parse_result["row_count"],
        col_count=parse_result["col_count"],
        source_headers=parse_result["headers"],
        status="uploaded",
    )
    db.add(workbook)
    db.commit()
    db.refresh(workbook)

    return {
        "workbook_id": workbook_id,
        "filename": file.filename,
        "row_count": parse_result["row_count"],
        "col_count": parse_result["col_count"],
        "headers": parse_result["headers"],
        "inferred_types": parse_result["inferred_types"],
        "column_stats": parse_result["column_stats"],
        "preview_rows": parse_result["preview_rows"][:50],
        "status": "uploaded",
    }


@router.get("/{workbook_id}/preview")
def get_preview(
    workbook_id: str,
    page: int = 1,
    page_size: int = 50,
    sort_by: Optional[str] = None,
    sort_dir: str = "asc",
    db: Session = Depends(get_db),
):
    wb = db.query(Workbook).filter(Workbook.id == workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")

    df = load_workbook_df(wb.file_path, wb.original_filename)
    result = get_data_page(df, page, page_size, sort_by=sort_by, sort_dir=sort_dir)
    result["headers"] = list(df.columns)
    return result


@router.get("/{workbook_id}")
def get_workbook(workbook_id: str, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")
    return wb


@router.delete("/{workbook_id}")
def delete_workbook(workbook_id: str, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")
    db.delete(wb)
    db.commit()
    return {"deleted": workbook_id}
