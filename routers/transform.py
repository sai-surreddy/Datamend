from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid

from models.database import get_db, Workbook, Project, Transform
from models.schemas import AITransformRequest, AITransformResult, ApplyTransformRequest, AutofixRequest
from services.parser import load_workbook_df, save_processed_df
from services.transformer import execute_transform, run_autofix_pipeline, get_data_page
from services.ai_service import ai_generate_transform, ai_generate_autofix, ai_fix_transform_error

router = APIRouter()

MAX_RETRY_ATTEMPTS = 3


async def _generate_and_verify(
    prompt: str,
    df,
    sample_rows: list,
    schema: list,
    preview_only: bool = True,
) -> dict:
    """
    Generate transform code, run it, and if it fails send the error back
    to the LLM for self-healing. Retries up to MAX_RETRY_ATTEMPTS times.

    Returns dict with keys:
        code, cols_affected, description, preview_df, preview_rows,
        rows_changed, error, attempts
    """
    headers = list(df.columns)
    code = None
    cols_affected = []
    description = ""
    last_error = None
    attempts = 0

    for attempt in range(1, MAX_RETRY_ATTEMPTS + 1):
        attempts = attempt

        # ── Generate code ──────────────────────────────────────────────────
        try:
            if attempt == 1:
                # First attempt — normal generation
                result = await ai_generate_transform(prompt, headers, sample_rows, schema)
            else:
                # Subsequent attempts — send error context back to LLM
                result = await ai_fix_transform_error(
                    original_prompt=prompt,
                    failed_code=code,
                    error_message=last_error,
                    headers=headers,
                    sample_rows=sample_rows,
                    schema=schema,
                    attempt=attempt,
                )
        except Exception as e:
            last_error = f"LLM call failed: {str(e)}"
            continue

        if not result.get("safe", True):
            last_error = "Generated code flagged as unsafe"
            continue

        code = result.get("pandas_code", "")
        cols_affected = result.get("columns_affected", [])
        description = result.get("description", "")
        fix_explanation = result.get("fix_explanation", "")

        if not code:
            last_error = "LLM returned empty code"
            continue

        # ── Try executing the code ──────────────────────────────────────────
        if preview_only:
            preview_df, exec_error = execute_transform(df, code)
            if exec_error:
                # Execution failed — save error and retry with context
                last_error = exec_error
                print(f"[Transform] Attempt {attempt} failed: {exec_error}")
                print(f"[Transform] Code was:\n{code}")
                continue
            else:
                # Success!
                preview_rows = preview_df.head(10).to_dict(orient="records")
                rows_changed = int((df.head(10) != preview_df.head(10)).any(axis=1).sum())
                return {
                    "code": code,
                    "cols_affected": cols_affected,
                    "description": description,
                    "fix_explanation": fix_explanation if attempt > 1 else "",
                    "preview_df": preview_df,
                    "preview_rows": preview_rows,
                    "rows_changed": rows_changed,
                    "error": None,
                    "attempts": attempts,
                }
        else:
            # Not preview — just return the code without running
            return {
                "code": code,
                "cols_affected": cols_affected,
                "description": description,
                "fix_explanation": "",
                "preview_df": None,
                "preview_rows": [],
                "rows_changed": 0,
                "error": None,
                "attempts": attempts,
            }

    # All attempts exhausted
    return {
        "code": code,
        "cols_affected": cols_affected,
        "description": description,
        "fix_explanation": "",
        "preview_df": None,
        "preview_rows": [],
        "rows_changed": 0,
        "error": last_error,
        "attempts": attempts,
    }


@router.post("/ai-transform")
async def create_ai_transform(data: AITransformRequest, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == data.workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")

    project = db.query(Project).filter(Project.id == wb.project_id).first()
    schema = project.target_schema if project else []

    df = load_workbook_df(wb.file_path, wb.original_filename)
    sample_rows = df.head(20).to_dict(orient="records")  # more samples for better context

    result = await _generate_and_verify(
        prompt=data.prompt,
        df=df,
        sample_rows=sample_rows,
        schema=schema,
        preview_only=data.preview_only,
    )

    # If all retries failed, raise with the last error
    if result["error"]:
        raise HTTPException(
            422,
            f"Transform failed after {result['attempts']} attempts. "
            f"Last error: {result['error']}\n\n"
            f"Try rephrasing your instruction with more detail about the date formats in your data."
        )

    # Save transform record
    transform_id = str(uuid.uuid4())
    tx = Transform(
        id=transform_id,
        workbook_id=wb.id,
        type="ai_transform",
        prompt=data.prompt,
        pandas_code=result["code"],
        columns_affected=result["cols_affected"],
        applied=False,
    )
    db.add(tx)
    db.commit()

    response = {
        "transform_id": transform_id,
        "prompt": data.prompt,
        "pandas_code": result["code"],
        "description": result["description"],
        "preview_rows": result["preview_rows"],
        "rows_affected": result["rows_changed"],
        "columns_affected": result["cols_affected"],
        "attempts": result["attempts"],
    }

    # Surface fix explanation to user if LLM had to self-correct
    if result["fix_explanation"]:
        response["fix_explanation"] = result["fix_explanation"]
        response["self_healed"] = True

    return response


@router.post("/apply")
def apply_transform(data: ApplyTransformRequest, db: Session = Depends(get_db)):
    tx = db.query(Transform).filter(Transform.id == data.transform_id).first()
    if not tx:
        raise HTTPException(404, "Transform not found")
    if tx.applied:
        raise HTTPException(400, "Transform already applied")

    wb = db.query(Workbook).filter(Workbook.id == tx.workbook_id).first()
    df = load_workbook_df(wb.file_path, wb.original_filename)

    new_df, err = execute_transform(df, tx.pandas_code)
    if err:
        # Even at apply time, try one self-heal round
        raise HTTPException(422, f"Transform failed at apply time: {err}. Please regenerate the transform.")

    new_path = save_processed_df(new_df, wb.id, wb.original_filename)
    wb.file_path = new_path
    wb.row_count = len(new_df)
    tx.applied = True
    tx.rows_affected = int((df != new_df).any(axis=1).sum())
    db.commit()

    return {
        "applied": True,
        "rows_affected": tx.rows_affected,
        "new_row_count": len(new_df),
    }


@router.post("/autofix")
async def run_autofix(data: AutofixRequest, db: Session = Depends(get_db)):
    wb = db.query(Workbook).filter(Workbook.id == data.workbook_id).first()
    if not wb:
        raise HTTPException(404, "Workbook not found")

    project = db.query(Project).filter(Project.id == wb.project_id).first()
    schema = project.target_schema if project else []
    mapping = wb.column_mapping or {}

    df = load_workbook_df(wb.file_path, wb.original_filename)
    sample_rows = df.head(20).to_dict(orient="records")

    validation_errors = []
    if wb.validation_summary:
        validation_errors = wb.validation_summary.get("errors", [])

    try:
        ai_fixes = await ai_generate_autofix(
            data.fix_types, list(df.columns), sample_rows, validation_errors, schema
        )
    except Exception:
        ai_fixes = []

    result = run_autofix_pipeline(df, data.fix_types, mapping, schema, ai_fixes)

    if not data.preview_only:
        new_path = save_processed_df(result["df"], wb.id, wb.original_filename)
        wb.file_path = new_path
        wb.row_count = result["rows_after"]
        db.commit()

    preview = result["df"].head(10).to_dict(orient="records")

    return {
        "preview_only": data.preview_only,
        "summary": result["summary"],
        "rows_after": result["rows_after"],
        "preview": preview,
    }


@router.get("/{workbook_id}/history")
def get_transform_history(workbook_id: str, db: Session = Depends(get_db)):
    transforms = db.query(Transform).filter(Transform.workbook_id == workbook_id)\
        .order_by(Transform.created_at.desc()).all()
    return transforms