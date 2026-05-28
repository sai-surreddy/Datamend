from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ── Schema Field ──────────────────────────────────────────────────────────────
class SchemaField(BaseModel):
    key: str
    label: str
    type: str                            # string | integer | float | email | phone | date | enum | boolean
    required: bool = False
    enum_values: Optional[List[str]] = None
    description: Optional[str] = None


# ── Project ───────────────────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    target_schema: Optional[List[SchemaField]] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    target_schema: Optional[List[SchemaField]] = None

class ProjectOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    target_schema: Optional[List[Dict]]
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ── Workbook ──────────────────────────────────────────────────────────────────
class WorkbookOut(BaseModel):
    id: str
    project_id: str
    name: str
    original_filename: Optional[str]
    file_type: Optional[str]
    row_count: int
    col_count: int
    source_headers: Optional[List[str]]
    column_mapping: Optional[Dict[str, str]]
    validation_summary: Optional[Dict]
    status: str
    created_at: datetime
    class Config:
        from_attributes = True


# ── Mapping ───────────────────────────────────────────────────────────────────
class MappingRequest(BaseModel):
    workbook_id: str
    mapping: Dict[str, Optional[str]]    # {source_col: target_field_key | null}

class AIMappingRequest(BaseModel):
    workbook_id: str
    target_schema: List[SchemaField]

class AIMappingResult(BaseModel):
    mapping: Dict[str, Optional[str]]
    confidence: Dict[str, float]
    suggestions: List[str]


# ── Validation ────────────────────────────────────────────────────────────────
class ValidationRule(BaseModel):
    field: str
    rule: str                            # required | email | integer | float | min_length | max_length | enum | regex | min | max
    value: Optional[Any] = None
    message: Optional[str] = None

class ValidationRequest(BaseModel):
    workbook_id: str
    rules: Optional[List[ValidationRule]] = None   # extra custom rules

class CellError(BaseModel):
    row: int
    field: str
    value: Any
    error: str
    severity: str                        # error | warning

class ValidationResult(BaseModel):
    total_rows: int
    valid_rows: int
    error_rows: int
    warning_rows: int
    total_errors: int
    total_warnings: int
    errors: List[CellError]
    warnings: List[CellError]
    column_stats: Dict[str, Dict]        # per-column stats


# ── Transform ─────────────────────────────────────────────────────────────────
class AITransformRequest(BaseModel):
    workbook_id: str
    prompt: str                          # "Capitalize all names", "Remove duplicates by email"
    preview_only: bool = True            # dry-run first

class AITransformResult(BaseModel):
    transform_id: str
    prompt: str
    pandas_code: str
    preview_rows: List[Dict]
    rows_affected: int
    columns_affected: List[str]

class ApplyTransformRequest(BaseModel):
    transform_id: str

class AutofixRequest(BaseModel):
    workbook_id: str
    fix_types: List[str]                 # ["email", "phone", "whitespace", "case", "duplicates"]
    preview_only: bool = True


# ── Export ────────────────────────────────────────────────────────────────────
class ExportRequest(BaseModel):
    workbook_id: str
    format: str = "csv"                  # csv | xlsx | json
    include_errors: bool = False
    only_valid: bool = True
    mapped_only: bool = True

class WebhookCreate(BaseModel):
    name: str
    url: str
    secret: Optional[str] = None
    events: List[str] = ["export.complete"]

class WebhookPushRequest(BaseModel):
    workbook_id: str
    webhook_id: str


# ── Data Preview ──────────────────────────────────────────────────────────────
class DataPreviewRequest(BaseModel):
    workbook_id: str
    page: int = 1
    page_size: int = 50
    filters: Optional[Dict[str, str]] = None   # {col: value}
    sort_by: Optional[str] = None
    sort_dir: str = "asc"

class DataPreviewResult(BaseModel):
    rows: List[Dict]
    total: int
    page: int
    page_size: int
    headers: List[str]
    column_stats: Optional[Dict] = None
