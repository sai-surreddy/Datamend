from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.database import get_db, Workbook, Project
from models.schemas import ValidationRequest, ValidationResult
from services.parser import load_workbook_df
from services.validator import validate_dataframe
from services.ai_service import ai_data_insights

router = APIRouter()


@router.post("/run", response_model=ValidationResult)
def run_validation(data: ValidationRequest, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == data.workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")

    project = db.query(Project).filter(Project.id == wb.project_id).first()
    schema = project.target_schema if project else []

    if not schema:
        raise HTTPException(400, "Project has no target schema defined. Add schema first.")
    if not wb.column_mapping:
        raise HTTPException(400, "No column mapping found. Map columns first.")

    df = load_workbook_df(wb.file_path, wb.original_filename)
    extra_rules = [r.model_dump() for r in data.rules] if data.rules else []

    result = validate_dataframe(df, wb.column_mapping, schema, extra_rules)

    # Persist summary
    summary = {k: v for k, v in result.items() if k not in ("errors", "warnings")}
    wb.validation_summary = summary
    wb.status = "validated"
    db.commit()

    return ValidationResult(**result)


@router.get("/{workbook_id}/summary")
def get_validation_summary(workbook_id: str, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")
    return wb.validation_summary or {"message": "Not validated yet"}


@router.post("/{workbook_id}/insights")
async def get_insights(workbook_id: str, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")

    if not wb.validation_summary:
        raise HTTPException(400, "Run validation first")

    df = load_workbook_df(wb.file_path, wb.original_filename)
    from services.parser import get_column_stats
    col_stats = get_column_stats(df)

    insights = await ai_data_insights(
        wb.source_headers or [],
        col_stats,
        wb.validation_summary,
        wb.row_count,
    )
    return {"insights": insights}
