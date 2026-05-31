from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body
from sqlalchemy.orm import Session
from typing import Optional
import uuid

from models.database import get_db, Project, Workbook
from services.parser import (
    save_upload, parse_file, parse_all_sheets,
    load_workbook_df, get_file_ext, save_processed_df
)
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
    """
    Upload a file. For Excel with multiple sheets, returns sheet_names
    so the frontend can prompt the user to choose. No workbook is created
    yet — call /confirm-sheet after the user selects a sheet.
    For single-sheet Excel, CSV, JSON — creates workbook immediately.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    ext = get_file_ext(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: .{ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(413, f"File too large. Max size: {settings.MAX_FILE_SIZE_MB}MB")

    # Save to disk with a temp ID
    temp_id = str(uuid.uuid4())
    file_path = save_upload(content, file.filename, temp_id)

    # For Excel — check how many sheets
    if ext in ("xlsx", "xls"):
        try:
            first_parse = parse_file(file_path, file.filename)
        except Exception as e:
            raise HTTPException(422, f"Could not parse file: {str(e)}")

        sheet_names = first_parse.get("sheet_names", [])

        # Multiple sheets — ask user to choose
        if len(sheet_names) > 1:
            return {
                "status": "sheet_selection_required",
                "temp_id": temp_id,
                "filename": file.filename,
                "file_path": file_path,
                "sheet_names": sheet_names,
                "total_sheets": len(sheet_names),
                # Return preview of each sheet (name + row count)
                "sheets_preview": first_parse.get("sheet_names", []),
            }

        # Single-sheet Excel — proceed normally
        return await _create_workbook(
            db, project_id, temp_id, file.filename, file_path, ext, first_parse, sheet_name=None
        )

    # CSV / JSON / TSV — parse and create workbook immediately
    try:
        parse_result = parse_file(file_path, file.filename)
    except Exception as e:
        raise HTTPException(422, f"Could not parse file: {str(e)}")

    return await _create_workbook(
        db, project_id, temp_id, file.filename, file_path, ext, parse_result, sheet_name=None
    )


@router.post("/confirm-sheet")
async def confirm_sheet(
    project_id: str = Form(...),
    temp_id: str = Form(...),
    file_path: str = Form(...),
    filename: str = Form(...),
    sheet_name: str = Form(...),
    import_all: bool = Form(False),
    db: Session = Depends(get_db),
):
    """
    Called after user selects a sheet (or chooses 'Import All Sheets').
    Creates one workbook per selected sheet.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    ext = get_file_ext(filename)

    if import_all:
        # Parse and create a workbook for every sheet
        all_results = parse_all_sheets(file_path, filename)
        workbooks = []
        for sheet_result in all_results:
            if sheet_result.get("error"):
                continue
            sname = sheet_result["sheet_name"]
            wb_id = str(uuid.uuid4())
            wb = _build_workbook(
                db, project_id, wb_id,
                original_filename=filename,
                file_path=file_path,
                file_ext=ext,
                parse_result=sheet_result,
                sheet_name=sname,
                display_name=f"{filename} — {sname}",
            )
            db.add(wb)
            workbooks.append({
                "workbook_id": wb_id,
                "sheet_name": sname,
                "row_count": sheet_result["row_count"],
                "col_count": sheet_result["col_count"],
                "headers": sheet_result["headers"],
                "status": "uploaded",
            })
        db.commit()
        return {
            "status": "all_sheets_imported",
            "workbooks": workbooks,
            "total": len(workbooks),
        }

    else:
        # Single sheet selected
        try:
            parse_result = parse_file(file_path, filename, sheet_name=sheet_name)
        except Exception as e:
            raise HTTPException(422, f"Could not parse sheet '{sheet_name}': {str(e)}")

        wb_id = str(uuid.uuid4())
        return await _create_workbook(
            db, project_id, wb_id, filename, file_path, ext,
            parse_result, sheet_name=sheet_name
        )


def _build_workbook(
    db, project_id, workbook_id, original_filename,
    file_path, file_ext, parse_result, sheet_name, display_name=None
):
    """Helper — build Workbook ORM object (does NOT commit)."""
    return Workbook(
        id=workbook_id,
        project_id=project_id,
        name=display_name or original_filename,
        original_filename=original_filename,
        file_path=file_path,
        file_type=file_ext,
        row_count=parse_result["row_count"],
        col_count=parse_result["col_count"],
        source_headers=parse_result["headers"],
        # Store sheet_name in validation_rules field (reuse JSON column)
        validation_rules={"sheet_name": sheet_name} if sheet_name else None,
        status="uploaded",
    )


async def _create_workbook(
    db, project_id, workbook_id, filename,
    file_path, ext, parse_result, sheet_name
):
    """Helper — create a single workbook and commit."""
    wb = _build_workbook(
        db, project_id, workbook_id, filename,
        file_path, ext, parse_result, sheet_name
    )
    db.add(wb)
    db.commit()
    db.refresh(wb)

    return {
        "workbook_id": workbook_id,
        "filename": filename,
        "sheet_name": sheet_name,
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

    # Get sheet_name from stored validation_rules JSON
    sheet_name = None
    if wb.validation_rules and isinstance(wb.validation_rules, dict):
        sheet_name = wb.validation_rules.get("sheet_name")

    df = load_workbook_df(wb.file_path, wb.original_filename, sheet_name=sheet_name)
    result = get_data_page(df, page, page_size, sort_by=sort_by, sort_dir=sort_dir)
    result["headers"] = list(df.columns)
    return result


@router.post("/{workbook_id}/save-edits")
def save_edits(
    workbook_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """
    Save user-edited rows back to disk as processed CSV.
    Called when user edits cells in the Workbook view during mapping step.
    """
    import pandas as pd
    wb = db.query(Workbook).filter(Workbook.id == workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")

    rows = payload.get("rows", [])
    if not rows:
        # No edits — that's fine, just return success
        return {"saved": True, "row_count": 0, "message": "No edits to save"}

    # Clean rows — remove any internal UI keys starting with _
    clean_rows = []
    for row in rows:
        clean_rows.append({k: v for k, v in row.items() if not k.startswith('_')})

    df = pd.DataFrame(clean_rows)
    new_path = save_processed_df(df, workbook_id, wb.original_filename)
    wb.file_path = new_path
    wb.row_count = len(df)
    db.commit()

    return {"saved": True, "row_count": len(df)}


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