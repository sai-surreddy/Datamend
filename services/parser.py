"""
File parsing service using Pandas.
Handles CSV, Excel, JSON, TSV with smart type inference.
"""
import pandas as pd
import numpy as np
import json
import os
from pathlib import Path
from typing import Tuple, Dict, List, Any
from config import settings


SUPPORTED_TYPES = {
    "csv": "text/csv",
    "tsv": "text/tab-separated-values",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "json": "application/json",
}


def get_file_ext(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


def save_upload(file_bytes: bytes, filename: str, workbook_id: str) -> str:
    """Save raw upload to disk, return path."""
    upload_dir = Path(settings.UPLOAD_DIR) / workbook_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / filename
    dest.write_bytes(file_bytes)
    return str(dest)


def load_dataframe(file_path: str, file_ext: str) -> pd.DataFrame:
    """Load file into a Pandas DataFrame based on extension."""
    if file_ext == "csv":
        # Try to detect delimiter automatically
        df = pd.read_csv(file_path, sep=None, engine="python", dtype=str, na_values=["", "NA", "N/A", "null", "NULL", "None"])
    elif file_ext == "tsv":
        df = pd.read_csv(file_path, sep="\t", dtype=str, na_values=["", "NA", "N/A"])
    elif file_ext in ("xlsx", "xls"):
        df = pd.read_excel(file_path, dtype=str, na_values=["", "NA", "N/A"])
    elif file_ext == "json":
        with open(file_path) as f:
            raw = json.load(f)
        if isinstance(raw, list):
            df = pd.DataFrame(raw)
        elif isinstance(raw, dict):
            # Handle {data: [...]} pattern
            for key in ["data", "rows", "records", "items", "results"]:
                if key in raw and isinstance(raw[key], list):
                    df = pd.DataFrame(raw[key])
                    break
            else:
                df = pd.DataFrame([raw])
        df = df.astype(str).replace("nan", "")
    else:
        raise ValueError(f"Unsupported file type: {file_ext}")

    # Clean column names
    df.columns = [str(c).strip() for c in df.columns]
    return df


def infer_column_types(df: pd.DataFrame) -> Dict[str, str]:
    """Infer semantic type for each column using Pandas + heuristics."""
    types = {}
    for col in df.columns:
        series = df[col].dropna().astype(str).str.strip()
        sample = series.head(100)

        # Email
        if sample.str.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').mean() > 0.7:
            types[col] = "email"
            continue

        # Phone
        if sample.str.match(r'^\+?[\d\s\-\(\)]{7,15}$').mean() > 0.7:
            types[col] = "phone"
            continue

        # Date
        try:
            pd.to_datetime(sample, infer_datetime_format=True, errors="raise")
            types[col] = "date"
            continue
        except Exception:
            pass

        # Integer
        try:
            sample.astype(int)
            types[col] = "integer"
            continue
        except Exception:
            pass

        # Float
        try:
            sample.astype(float)
            types[col] = "float"
            continue
        except Exception:
            pass

        # Boolean
        bool_vals = {"true", "false", "yes", "no", "1", "0", "y", "n"}
        if set(sample.str.lower().unique()).issubset(bool_vals):
            types[col] = "boolean"
            continue

        # Enum (low cardinality)
        unique_ratio = series.nunique() / max(len(series), 1)
        if unique_ratio < 0.1 and series.nunique() <= 20:
            types[col] = "enum"
            continue

        types[col] = "string"

    return types


def get_column_stats(df: pd.DataFrame) -> Dict[str, Dict]:
    """Compute per-column stats for the UI."""
    stats = {}
    for col in df.columns:
        series = df[col].replace("", np.nan)
        null_count = int(series.isna().sum())
        unique_count = int(series.nunique())
        total = len(df)

        stat = {
            "null_count": null_count,
            "null_pct": round(null_count / total * 100, 1) if total else 0,
            "unique_count": unique_count,
            "unique_pct": round(unique_count / total * 100, 1) if total else 0,
            "fill_pct": round((total - null_count) / total * 100, 1) if total else 0,
        }

        # Top values for enums / low cardinality
        if unique_count <= 20:
            stat["top_values"] = series.dropna().value_counts().head(10).to_dict()

        # Numeric stats
        numeric = pd.to_numeric(series, errors="coerce")
        if numeric.notna().sum() > total * 0.5:
            stat["min"] = float(numeric.min()) if not pd.isna(numeric.min()) else None
            stat["max"] = float(numeric.max()) if not pd.isna(numeric.max()) else None
            stat["mean"] = round(float(numeric.mean()), 2) if not pd.isna(numeric.mean()) else None

        stats[col] = stat

    return stats


def parse_file(file_path: str, filename: str) -> Dict[str, Any]:
    """
    Full parse pipeline. Returns dict with headers, types, stats,
    preview rows and counts.
    """
    ext = get_file_ext(filename)
    df = load_dataframe(file_path, ext)

    # Drop fully empty rows/cols
    df.dropna(how="all", inplace=True)
    df.dropna(axis=1, how="all", inplace=True)
    df.fillna("", inplace=True)

    headers = list(df.columns)
    inferred_types = infer_column_types(df)
    col_stats = get_column_stats(df)

    preview = df.head(100).replace({np.nan: None}).to_dict(orient="records")

    return {
        "headers": headers,
        "row_count": len(df),
        "col_count": len(headers),
        "inferred_types": inferred_types,
        "column_stats": col_stats,
        "preview_rows": preview,
        "file_type": ext,
    }


def load_workbook_df(file_path: str, filename: str) -> pd.DataFrame:
    """Load full DataFrame for processing (validation, transforms, export)."""
    # If the file on disk is already a CSV (processed copy), always use csv parser
    actual_ext = get_file_ext(file_path)
    if actual_ext == "csv":
        df = load_dataframe(file_path, "csv")
    else:
        ext = get_file_ext(filename)
        df = load_dataframe(file_path, ext)
    df.dropna(how="all", inplace=True)
    df.fillna("", inplace=True)
    return df


def save_processed_df(df: pd.DataFrame, workbook_id: str, filename: str) -> str:
    """Persist processed DataFrame back to disk as CSV."""
    stem = Path(filename).stem   # strips extension safely
    path = Path(settings.UPLOAD_DIR) / workbook_id / f"processed_{stem}.csv"
    df.to_csv(path, index=False)
    return str(path)
