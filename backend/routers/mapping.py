from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.database import get_db, Workbook, Project
from models.schemas import MappingRequest, AIMappingRequest, AIMappingResult
from services.parser import load_workbook_df
from services.ai_service import ai_map_columns, ai_suggest_schema

router = APIRouter()


@router.post("/save")
def save_mapping(data: MappingRequest, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == data.workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")
    wb.column_mapping = {k: v for k, v in data.mapping.items() if v}
    wb.status = "mapped"
    db.commit()
    return {"saved": True, "mapped_columns": len(wb.column_mapping)}


@router.post("/ai-suggest", response_model=AIMappingResult)
async def ai_suggest_mapping(data: AIMappingRequest, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == data.workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")

    # Load sample data for context
    df = load_workbook_df(wb.file_path, wb.original_filename)
    sample_rows = df.head(5).to_dict(orient="records")

    # Build samples per column
    source_samples = {}
    for col in wb.source_headers or []:
        if col in df.columns:
            source_samples[col] = df[col].dropna().head(5).tolist()

    schema_dicts = [f.model_dump() for f in data.target_schema]

    try:
        result = await ai_map_columns(wb.source_headers or [], source_samples, schema_dicts)
    except Exception as e:
        raise HTTPException(500, f"AI mapping failed: {str(e)}")

    # Save mapping to DB
    mapping = result.get("mapping", {})
    clean_mapping = {k: v for k, v in mapping.items() if v and v != "null"}
    wb.column_mapping = clean_mapping
    wb.status = "mapped"
    db.commit()

    return AIMappingResult(
        mapping=mapping,
        confidence=result.get("confidence", {}),
        suggestions=result.get("suggestions", []),
    )


@router.post("/suggest-schema")
async def suggest_schema(workbook_id: str, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")

    df = load_workbook_df(wb.file_path, wb.original_filename)
    from services.parser import infer_column_types
    inferred = infer_column_types(df)
    sample_rows = df.head(5).to_dict(orient="records")

    try:
        schema = await ai_suggest_schema(list(df.columns), inferred, sample_rows)
    except Exception as e:
        raise HTTPException(500, f"Schema suggestion failed: {str(e)}")

    return {"schema": schema}


@router.get("/{workbook_id}")
def get_mapping(workbook_id: str, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")
    return {
        "workbook_id": workbook_id,
        "source_headers": wb.source_headers,
        "column_mapping": wb.column_mapping or {},
    }
