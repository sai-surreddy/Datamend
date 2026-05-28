"""
Export service — produces CSV, XLSX, JSON files and fires webhooks.
"""
import pandas as pd
import numpy as np
import json
import io
import hashlib
import hmac
import time
from pathlib import Path
from typing import Dict, List, Optional
import httpx

from config import settings
from services.parser import load_workbook_df, get_file_ext
from services.validator import get_valid_rows


def build_export_df(
    df: pd.DataFrame,
    mapping: Dict[str, str],
    schema: List[Dict],
    mapped_only: bool = True,
) -> pd.DataFrame:
    """
    Apply column mapping and rename to target field names.
    Optionally keep only mapped columns.
    """
    rev = {v: k for k, v in mapping.items() if v}

    if mapped_only:
        cols = {}
        for field in schema:
            fkey = field["key"]
            src = rev.get(fkey)
            if src and src in df.columns:
                cols[fkey] = df[src]
        return pd.DataFrame(cols)
    else:
        return df.rename(columns={v: k for k, v in rev.items()})


def export_csv(df: pd.DataFrame) -> bytes:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue().encode("utf-8")


def export_xlsx(df: pd.DataFrame) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Data")
        # Auto-size columns
        ws = writer.sheets["Data"]
        for col_cells in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col_cells)
            ws.column_dimensions[col_cells[0].column_letter].width = min(max_len + 4, 50)
    return buf.getvalue()


def export_json(df: pd.DataFrame) -> bytes:
    records = df.replace({np.nan: None}).to_dict(orient="records")
    return json.dumps({"data": records, "count": len(records)}, indent=2).encode("utf-8")


EXPORT_FUNCS = {
    "csv": (export_csv, "text/csv", ".csv"),
    "xlsx": (export_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"),
    "json": (export_json, "application/json", ".json"),
}


def run_export(
    file_path: str,
    filename: str,
    mapping: Dict[str, str],
    schema: List[Dict],
    format: str = "csv",
    only_valid: bool = True,
    include_errors: bool = False,
    validation_result: Optional[Dict] = None,
    mapped_only: bool = True,
) -> Dict:
    df = load_workbook_df(file_path, filename)

    if only_valid and validation_result:
        df = get_valid_rows(df, validation_result)

    export_df = build_export_df(df, mapping, schema, mapped_only)

    if format not in EXPORT_FUNCS:
        raise ValueError(f"Unsupported format: {format}")

    fn, media_type, ext = EXPORT_FUNCS[format]
    data = fn(export_df)

    return {
        "data": data,
        "media_type": media_type,
        "filename": f"export_{Path(filename).stem}{ext}",
        "row_count": len(export_df),
    }


# ── Webhook delivery ──────────────────────────────────────────────────────────

def _sign_payload(payload: bytes, secret: str) -> str:
    """HMAC-SHA256 signature for webhook verification."""
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


async def deliver_webhook(
    url: str,
    event: str,
    payload: Dict,
    secret: Optional[str] = None,
) -> Dict:
    body = json.dumps({
        "event": event,
        "timestamp": int(time.time()),
        "data": payload,
    }).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "DataFlow-Webhook/1.0",
        "X-DataFlow-Event": event,
    }
    if secret:
        headers["X-DataFlow-Signature"] = f"sha256={_sign_payload(body, secret)}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, content=body, headers=headers)
            return {
                "success": resp.status_code < 300,
                "status_code": resp.status_code,
                "response": resp.text[:500],
            }
    except Exception as e:
        return {"success": False, "error": str(e)}
