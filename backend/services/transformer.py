"""
Transformation service — applies Pandas operations to DataFrames.
Handles AI-generated transforms and built-in AutoFix operations.
"""
import pandas as pd
import numpy as np
import re
import traceback
from typing import Dict, List, Any, Tuple


# ── Safe code execution sandbox ───────────────────────────────────────────────

BLOCKED_PATTERNS = [
    r'\bos\b', r'\bsys\b', r'\bsubprocess\b', r'\beval\b', r'\bexec\b',
    r'\bopen\b', r'\b__import__\b', r'\bcompile\b', r'import\s+os',
    r'import\s+sys', r'import\s+subprocess', r'\bshutil\b',
]


def is_code_safe(code: str) -> bool:
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, code):
            return False
    return True


def execute_transform(df: pd.DataFrame, code: str) -> Tuple[pd.DataFrame, str]:
    """
    Execute Pandas code on a copy of the DataFrame.
    Returns (modified_df, error_message).
    """
    if not is_code_safe(code):
        return df, "Security: code contains blocked operations"

    df_copy = df.copy()
    local_vars = {"df": df_copy, "pd": pd, "np": np, "re": re}

    try:
        exec(code, {"__builtins__": {}}, local_vars)
        result = local_vars.get("df", df_copy)
        if not isinstance(result, pd.DataFrame):
            result = df_copy
        return result, ""
    except Exception as e:
        return df, f"Transform error: {str(e)}"


# ── Built-in AutoFix operations ───────────────────────────────────────────────

def autofix_whitespace(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """Strip leading/trailing whitespace from all string columns."""
    df_out = df.copy()
    count = 0
    for col in df_out.select_dtypes(include="object").columns:
        before = df_out[col].copy()
        df_out[col] = df_out[col].str.strip()
        count += (before != df_out[col]).sum()
    return df_out, int(count)


def autofix_case(df: pd.DataFrame, cols: List[str] = None, mode: str = "title") -> Tuple[pd.DataFrame, int]:
    """Fix casing on string columns (title, upper, lower)."""
    df_out = df.copy()
    targets = cols or list(df_out.select_dtypes(include="object").columns)
    count = 0
    for col in targets:
        if col in df_out.columns:
            before = df_out[col].copy()
            if mode == "title":
                df_out[col] = df_out[col].str.title()
            elif mode == "upper":
                df_out[col] = df_out[col].str.upper()
            elif mode == "lower":
                df_out[col] = df_out[col].str.lower()
            count += (before != df_out[col]).sum()
    return df_out, int(count)


def autofix_email(df: pd.DataFrame, email_cols: List[str]) -> Tuple[pd.DataFrame, int]:
    """Lowercase and strip email columns."""
    df_out = df.copy()
    count = 0
    for col in email_cols:
        if col in df_out.columns:
            before = df_out[col].copy()
            df_out[col] = df_out[col].str.lower().str.strip()
            count += (before != df_out[col]).sum()
    return df_out, int(count)


def autofix_phone(df: pd.DataFrame, phone_cols: List[str]) -> Tuple[pd.DataFrame, int]:
    """Normalize phone numbers — remove non-numeric except + and spaces."""
    df_out = df.copy()
    count = 0
    for col in phone_cols:
        if col in df_out.columns:
            before = df_out[col].copy()
            df_out[col] = df_out[col].str.replace(r'[^\d\+\s\-]', '', regex=True).str.strip()
            count += (before != df_out[col]).sum()
    return df_out, int(count)


def autofix_duplicates(df: pd.DataFrame, subset: List[str] = None) -> Tuple[pd.DataFrame, int]:
    """Remove duplicate rows."""
    before = len(df)
    df_out = df.drop_duplicates(subset=subset, keep="first")
    return df_out, before - len(df_out)


def autofix_nulls(df: pd.DataFrame, fill_map: Dict[str, Any] = None) -> Tuple[pd.DataFrame, int]:
    """Fill null/empty values."""
    df_out = df.copy()
    count = 0
    if fill_map:
        for col, fill_val in fill_map.items():
            if col in df_out.columns:
                mask = df_out[col].replace("", np.nan).isna()
                df_out.loc[mask, col] = fill_val
                count += int(mask.sum())
    return df_out, count


def run_autofix_pipeline(
    df: pd.DataFrame,
    fix_types: List[str],
    mapping: Dict[str, str],
    schema: List[Dict],
    pandas_fixes: List[Dict] = None,
) -> Dict:
    """
    Run selected autofix operations.
    Returns dict with modified df, summary of changes.
    """
    df_out = df.copy()
    summary = []

    # Identify typed columns from schema + mapping
    rev = {v: k for k, v in mapping.items() if v}
    email_src_cols = [rev[f["key"]] for f in schema if f.get("type") == "email" and f["key"] in rev]
    phone_src_cols = [rev[f["key"]] for f in schema if f.get("type") == "phone" and f["key"] in rev]

    if "whitespace" in fix_types:
        df_out, n = autofix_whitespace(df_out)
        summary.append({"fix": "whitespace", "cells_fixed": n, "description": "Stripped whitespace from all cells"})

    if "email" in fix_types and email_src_cols:
        df_out, n = autofix_email(df_out, email_src_cols)
        summary.append({"fix": "email", "cells_fixed": n, "description": f"Normalized email columns: {email_src_cols}"})

    if "phone" in fix_types and phone_src_cols:
        df_out, n = autofix_phone(df_out, phone_src_cols)
        summary.append({"fix": "phone", "cells_fixed": n, "description": f"Normalized phone columns: {phone_src_cols}"})

    if "case" in fix_types:
        # Title-case name-like columns
        name_cols = [rev[f["key"]] for f in schema
                     if f.get("type") == "string" and any(x in f["key"].lower() for x in ["name", "first", "last", "full"])
                     and f["key"] in rev]
        if name_cols:
            df_out, n = autofix_case(df_out, name_cols, mode="title")
            summary.append({"fix": "case", "cells_fixed": n, "description": f"Title-cased name columns: {name_cols}"})

    if "duplicates" in fix_types:
        df_out, n = autofix_duplicates(df_out)
        summary.append({"fix": "duplicates", "rows_removed": n, "description": f"Removed {n} duplicate rows"})

    # Apply AI-generated pandas fixes
    if pandas_fixes:
        for fix in pandas_fixes:
            code = fix.get("pandas_code", "")
            if code:
                df_out, err = execute_transform(df_out, code)
                if not err:
                    summary.append({"fix": fix.get("fix_type", "ai"), "description": fix.get("description", "AI fix applied")})

    return {"df": df_out, "summary": summary, "rows_after": len(df_out)}


# ── Data preview with filtering & sorting ─────────────────────────────────────

def get_data_page(
    df: pd.DataFrame,
    page: int = 1,
    page_size: int = 50,
    filters: Dict[str, str] = None,
    sort_by: str = None,
    sort_dir: str = "asc",
) -> Dict:
    result = df.copy()

    # Apply filters
    if filters:
        for col, val in filters.items():
            if col in result.columns and val:
                result = result[result[col].str.contains(val, case=False, na=False)]

    # Sort
    if sort_by and sort_by in result.columns:
        result = result.sort_values(sort_by, ascending=(sort_dir == "asc"))

    total = len(result)
    start = (page - 1) * page_size
    end = start + page_size
    page_df = result.iloc[start:end]

    return {
        "rows": page_df.replace({np.nan: None}).to_dict(orient="records"),
        "total": total,
        "page": page,
        "page_size": page_size,
    }
