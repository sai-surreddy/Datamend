"""
Validation engine — applies rules against a DataFrame using Pandas + NumPy.
Produces row-level and column-level error reports.
"""
import pandas as pd
import numpy as np
import re
from typing import List, Dict, Any, Tuple


# ── Built-in rule validators ──────────────────────────────────────────────────

def _check_required(series: pd.Series) -> pd.Series:
    """Returns boolean mask: True = error (value is empty/null)."""
    return series.replace("", np.nan).isna()


def _check_email(series: pd.Series) -> pd.Series:
    pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
    non_empty = series.replace("", np.nan).notna()
    valid = series.str.match(pattern, na=True)
    return non_empty & ~valid


def _check_integer(series: pd.Series) -> pd.Series:
    non_empty = series.replace("", np.nan).notna()
    def is_int(v):
        try: int(v); return True
        except: return False
    valid = series.apply(lambda x: is_int(x) if x != "" else True)
    return non_empty & ~valid


def _check_float(series: pd.Series) -> pd.Series:
    non_empty = series.replace("", np.nan).notna()
    numeric = pd.to_numeric(series, errors="coerce")
    return non_empty & numeric.isna()


def _check_phone(series: pd.Series) -> pd.Series:
    pattern = r'^\+?[\d\s\-\(\)\.]{7,20}$'
    non_empty = series.replace("", np.nan).notna()
    valid = series.str.match(pattern, na=True)
    return non_empty & ~valid


def _check_date(series: pd.Series) -> pd.Series:
    non_empty = series.replace("", np.nan).notna()
    parsed = pd.to_datetime(series, errors="coerce", infer_datetime_format=True)
    return non_empty & parsed.isna()


def _check_min_length(series: pd.Series, value: int) -> pd.Series:
    non_empty = series.replace("", np.nan).notna()
    return non_empty & (series.str.len() < value)


def _check_max_length(series: pd.Series, value: int) -> pd.Series:
    non_empty = series.replace("", np.nan).notna()
    return non_empty & (series.str.len() > value)


def _check_enum(series: pd.Series, value: List[str]) -> pd.Series:
    non_empty = series.replace("", np.nan).notna()
    allowed = [str(v).lower().strip() for v in value]
    return non_empty & ~series.str.lower().str.strip().isin(allowed)


def _check_regex(series: pd.Series, value: str) -> pd.Series:
    non_empty = series.replace("", np.nan).notna()
    try:
        valid = series.str.match(value, na=True)
    except re.error:
        valid = pd.Series([True] * len(series), index=series.index)
    return non_empty & ~valid


def _check_min(series: pd.Series, value: float) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    non_empty = series.replace("", np.nan).notna()
    return non_empty & numeric.notna() & (numeric < value)


def _check_max(series: pd.Series, value: float) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    non_empty = series.replace("", np.nan).notna()
    return non_empty & numeric.notna() & (numeric > value)


def _check_unique(series: pd.Series) -> pd.Series:
    return series.duplicated(keep=False) & series.replace("", np.nan).notna()


RULE_MAP = {
    "required": (_check_required, "error"),
    "email": (_check_email, "error"),
    "integer": (_check_integer, "error"),
    "float": (_check_float, "error"),
    "phone": (_check_phone, "warning"),
    "date": (_check_date, "warning"),
    "min_length": (_check_min_length, "error"),
    "max_length": (_check_max_length, "warning"),
    "enum": (_check_enum, "error"),
    "regex": (_check_regex, "error"),
    "min": (_check_min, "error"),
    "max": (_check_max, "error"),
    "unique": (_check_unique, "warning"),
}


# ── Schema-derived default rules ──────────────────────────────────────────────

def rules_from_schema(schema: List[Dict]) -> List[Dict]:
    """Auto-generate validation rules from a target schema definition."""
    rules = []
    for field in schema:
        fkey = field["key"]
        ftype = field.get("type", "string")

        if field.get("required"):
            rules.append({"field": fkey, "rule": "required", "message": f"{field['label']} is required"})

        if ftype == "email":
            rules.append({"field": fkey, "rule": "email", "message": "Must be a valid email address"})
        elif ftype == "integer":
            rules.append({"field": fkey, "rule": "integer", "message": "Must be a whole number"})
        elif ftype == "float":
            rules.append({"field": fkey, "rule": "float", "message": "Must be a number"})
        elif ftype == "phone":
            rules.append({"field": fkey, "rule": "phone", "message": "Invalid phone number format"})
        elif ftype == "date":
            rules.append({"field": fkey, "rule": "date", "message": "Must be a valid date"})
        elif ftype == "enum" and field.get("enum_values"):
            rules.append({"field": fkey, "rule": "enum", "value": field["enum_values"],
                          "message": f"Must be one of: {', '.join(field['enum_values'])}"})

    return rules


# ── Main validation runner ────────────────────────────────────────────────────

def validate_dataframe(
    df: pd.DataFrame,
    mapping: Dict[str, str],          # {source_col: target_field}
    schema: List[Dict],
    extra_rules: List[Dict] = None,
) -> Dict:
    """
    Run full validation pipeline.

    1. Re-map columns to target field names.
    2. Apply schema-derived rules.
    3. Apply extra custom rules.
    4. Return structured result.
    """
    # Build reverse mapping: target_field → source_col
    rev = {v: k for k, v in mapping.items() if v}

    # Build working DataFrame with target field names
    mapped_cols = {}
    for field in schema:
        fkey = field["key"]
        src = rev.get(fkey)
        if src and src in df.columns:
            mapped_cols[fkey] = df[src].astype(str).str.strip()
        else:
            mapped_cols[fkey] = pd.Series([""] * len(df), dtype=str)

    mapped_df = pd.DataFrame(mapped_cols)

    # Collect rules
    all_rules = rules_from_schema(schema)
    if extra_rules:
        all_rules.extend(extra_rules)

    errors: List[Dict] = []
    warnings: List[Dict] = []
    col_error_counts: Dict[str, int] = {f["key"]: 0 for f in schema}

    for rule_def in all_rules:
        field = rule_def["field"]
        rule = rule_def["rule"]
        value = rule_def.get("value")
        message = rule_def.get("message", f"Validation failed: {rule}")

        if field not in mapped_df.columns:
            continue

        series = mapped_df[field]

        if rule in RULE_MAP:
            fn, severity = RULE_MAP[rule]
            try:
                if value is not None:
                    mask = fn(series, value)
                else:
                    mask = fn(series)
            except Exception:
                continue

            bad_rows = mask[mask].index.tolist()
            for row_idx in bad_rows[:500]:   # cap at 500 per rule
                entry = {
                    "row": int(row_idx),
                    "field": field,
                    "value": str(series.iloc[row_idx]) if row_idx < len(series) else "",
                    "error": message,
                    "severity": severity,
                }
                if severity == "error":
                    errors.append(entry)
                    col_error_counts[field] = col_error_counts.get(field, 0) + 1
                else:
                    warnings.append(entry)

    # Row-level aggregation
    error_rows_set = set(e["row"] for e in errors)
    warning_rows_set = set(w["row"] for w in warnings) - error_rows_set
    valid_rows = len(df) - len(error_rows_set) - len(warning_rows_set)

    # Per-column stats
    column_stats = {}
    for col in mapped_df.columns:
        s = mapped_df[col]
        column_stats[col] = {
            "null_count": int((s == "").sum()),
            "unique_count": int(s.nunique()),
            "error_count": col_error_counts.get(col, 0),
        }

    return {
        "total_rows": len(df),
        "valid_rows": max(0, valid_rows),
        "error_rows": len(error_rows_set),
        "warning_rows": len(warning_rows_set),
        "total_errors": len(errors),
        "total_warnings": len(warnings),
        "errors": errors[:1000],       # return first 1000
        "warnings": warnings[:1000],
        "column_stats": column_stats,
    }


def get_valid_rows(df: pd.DataFrame, validation_result: Dict) -> pd.DataFrame:
    """Filter DataFrame to rows with no errors."""
    error_rows = set(e["row"] for e in validation_result.get("errors", []))
    return df[~df.index.isin(error_rows)]
