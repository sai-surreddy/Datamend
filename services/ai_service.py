"""
Claude API integration for:
- Smart column mapping
- Natural language → Pandas transforms
- AutoFix suggestions
"""
import httpx
import json
import re
from typing import Dict, List, Any, Optional
from config import settings

import openai

async def _call_claude(system: str, user: str, max_tokens: int = 1024) -> str:
    client = openai.AsyncOpenAI(
        base_url=settings.NVIDIA_BASE_URL,
        api_key=settings.NVIDIA_API_KEY,
    )
    response = await client.chat.completions.create(
        model=settings.NVIDIA_MODEL,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return response.choices[0].message.content


def _extract_json(text: str) -> Any:
    """Strip markdown fences and parse JSON."""
    clean = re.sub(r"```(?:json)?|```", "", text).strip()
    return json.loads(clean)


# ── AI Column Mapping ─────────────────────────────────────────────────────────

async def ai_map_columns(
    source_headers: List[str],
    source_samples: Dict[str, List[str]],   # {col: [val1, val2, ...]}
    target_schema: List[Dict],
) -> Dict:
    system = """You are a data mapping expert. Given source CSV/Excel column names and sample values,
map each source column to the most semantically appropriate target field.
Respond ONLY with valid JSON in this exact format:
{
  "mapping": {"source_col": "target_field_key_or_null", ...},
  "confidence": {"source_col": 0.95, ...},
  "suggestions": ["suggestion 1", "suggestion 2"]
}
Use null for columns with no good match. Confidence is 0.0-1.0.

CRITICAL SYNONYM RULES - you MUST apply these aggressively:
- date_of_birth, dob, birth_date, birthdate, born, birth, DOB, BirthDate → date type fields
- zip, zip_code, zipcode, postal, postal_code, pincode, pin_code, postcode → any zip/postal field
- phone, mobile, cell, tel, telephone, mob, ph, contact_no, contact_number, ph_no → phone fields
- email, e-mail, mail, email_address, emailid, e_mail → email fields
- name, full_name, fullname, customer_name, client_name, person_name, fname+lname → name fields
- first_name, firstname, fname, given_name → first name fields
- last_name, lastname, lname, surname, family_name → last name fields
- company, firm, organisation, organization, org, employer, business, company_name → company fields
- id, ID, identifier, record_id, customer_id, user_id, uid, sl_no, serial → id fields
- age, years, yrs → age/integer fields
- country, nation, nationality, location, loc, region → country fields
- state, province, territory → state fields
- city, town, locality, district → city fields
- status, state, active, flag → status/enum fields
- gender, sex → gender fields
- salary, income, pay, wage, compensation → salary/float fields

USE SAMPLE VALUES AS STRONG HINTS:
- Values like "1990-01-15", "15/01/1990", "Jan 15 1990" → this is a date column
- Values like "560001", "10001", "SW1A 1AA" → this is a postal/zip column
- Values like "+91-9876543210", "9876543210" → this is a phone column
- Values like "john@example.com" → this is an email column
- Values like "M/F", "Male/Female" → this is a gender/enum column"""

    user = f"""Source columns and their actual sample values:
{json.dumps(source_samples, indent=2)}

Target schema fields to map to:
{json.dumps([{"key": f["key"], "label": f["label"], "type": f["type"], "description": f.get("description","")} for f in target_schema], indent=2)}

Instructions:
- Use BOTH column name AND sample values to decide mapping
- Be aggressive — if sample values look like dates, map it to a date field even if column name is ambiguous
- Each target field should be mapped at most once (pick the best source column)
- If a source column clearly does not match any target field, use null
- Columns like "dob", "zip_code", "mobile_no" MUST be mapped if matching target fields exist"""

    raw = await _call_claude(system, user, max_tokens=1000)
    result = _extract_json(raw)
    return result


# ── AI Transform ──────────────────────────────────────────────────────────────

async def ai_generate_transform(
    prompt: str,
    headers: List[str],
    sample_rows: List[Dict],
    schema: List[Dict],
) -> Dict:
    system = """You are a Pandas expert. Given a user's natural language instruction and a DataFrame description,
generate safe, executable Pandas code to transform the DataFrame.
The DataFrame is called `df` and all columns are strings.
Respond ONLY with valid JSON:
{
  "pandas_code": "df['col'] = df['col'].str.strip().str.title()",
  "columns_affected": ["col"],
  "description": "human-readable description of what this does",
  "safe": true
}
NEVER use eval(), exec(), os, sys, subprocess, or any I/O operations.
Only use: pandas (pd), numpy (np), re, string methods."""

    user = f"""User instruction: {prompt}

DataFrame columns: {headers}

Sample data (first 5 rows):
{json.dumps(sample_rows[:5], indent=2)}

Target schema context:
{json.dumps([{"key": f["key"], "type": f["type"]} for f in schema], indent=2)}

Generate pandas code to fulfill the instruction."""

    raw = await _call_claude(system, user, max_tokens=600)
    return _extract_json(raw)


# ── AutoFix ───────────────────────────────────────────────────────────────────

async def ai_generate_autofix(
    fix_types: List[str],
    headers: List[str],
    sample_rows: List[Dict],
    validation_errors: List[Dict],
    schema: List[Dict],
) -> List[Dict]:
    """Generate a list of Pandas fix operations for common errors."""
    system = """You are a data cleaning expert. Generate Pandas fix operations for common data quality issues.
Respond ONLY with valid JSON — a list of fix operations:
[
  {
    "fix_type": "whitespace",
    "pandas_code": "for col in df.columns: df[col] = df[col].str.strip()",
    "columns_affected": ["all"],
    "description": "Remove leading/trailing whitespace from all columns"
  }
]"""

    # Summarize errors by type
    error_summary = {}
    for e in validation_errors[:50]:
        key = f"{e['field']}:{e['error']}"
        error_summary[key] = error_summary.get(key, 0) + 1

    user = f"""Fix types requested: {fix_types}
DataFrame columns: {headers}
Sample data: {json.dumps(sample_rows[:3], indent=2)}
Validation error summary: {json.dumps(error_summary, indent=2)}
Schema: {json.dumps([{"key": f["key"], "type": f["type"]} for f in schema], indent=2)}

Generate fix operations for each requested fix type."""

    raw = await _call_claude(system, user, max_tokens=800)
    return _extract_json(raw)


# ── Schema Suggestion ─────────────────────────────────────────────────────────

async def ai_suggest_schema(
    headers: List[str],
    inferred_types: Dict[str, str],
    sample_rows: List[Dict],
) -> List[Dict]:
    """Suggest a target schema based on the uploaded file."""
    system = """You are a data architect. Given source column info, suggest a clean, normalized target schema.
Respond ONLY with valid JSON — a list of field definitions:
[
  {"key": "email", "label": "Email Address", "type": "email", "required": true, "description": "Primary email"},
  ...
]
Types: string | integer | float | email | phone | date | enum | boolean"""

    user = f"""Source columns with inferred types:
{json.dumps(inferred_types, indent=2)}

Sample data:
{json.dumps(sample_rows[:5], indent=2)}

Suggest a clean, minimal target schema. Normalize naming (snake_case keys, Title Case labels).
Mark fields as required only if they appear in every row."""

    raw = await _call_claude(system, user, max_tokens=800)
    return _extract_json(raw)


# ── Data Insights ─────────────────────────────────────────────────────────────

async def ai_data_insights(
    headers: List[str],
    column_stats: Dict[str, Dict],
    validation_summary: Dict,
    row_count: int,
) -> str:
    """Generate plain-English insights about the dataset."""
    system = "You are a data analyst. Give a short, actionable summary of data quality issues and recommendations. Be concise — max 5 bullet points."

    user = f"""Dataset: {row_count} rows, {len(headers)} columns
Column stats: {json.dumps(column_stats, indent=2)}
Validation summary: {json.dumps(validation_summary, indent=2)}

Give data quality insights and top recommendations."""

    return await _call_claude(system, user, max_tokens=400)


# ── Transform Error Self-Healing ──────────────────────────────────────────────

async def ai_fix_transform_error(
    original_prompt: str,
    failed_code: str,
    error_message: str,
    headers: List[str],
    sample_rows: List[Dict],
    schema: List[Dict],
    attempt: int = 1,
) -> Dict:
    """
    Called when generated Pandas code throws an error during execution.
    Sends the error + actual sample values back to the LLM so it can
    produce corrected code that handles the real data format.
    """
    system = """You are a Pandas debugging expert. You previously generated code that failed.
Your job is to fix it using the actual error message and real sample data provided.

Rules:
- The DataFrame is called `df`, all columns are strings
- NEVER use eval(), exec(), os, sys, subprocess
- Only use: pandas (pd), numpy (np), re, string methods
- For date parsing, ALWAYS use pd.to_datetime(..., infer_datetime_format=True, errors='coerce')
  or format='mixed' to handle inconsistent date formats
- If a column has mixed formats, parse each value individually with a try/except approach
- After parsing dates, convert back to string with .dt.strftime() if output should be string
- Respond ONLY with valid JSON:
{
  "pandas_code": "...",
  "columns_affected": ["col"],
  "description": "what this fixed version does differently",
  "safe": true,
  "fix_explanation": "why the original failed and what you changed"
}"""

    # Extract unique values from affected columns to show real data variety
    affected_cols = []
    for row in sample_rows[:20]:
        for k, v in row.items():
            if v and str(v).strip():
                if any(c in str(v) for c in ['/', '-', '.']):
                    if k not in affected_cols:
                        affected_cols.append(k)

    # Get sample of unique values per column to show format variety
    col_samples = {}
    for col in affected_cols[:5]:
        unique_vals = list({str(row.get(col, '')) for row in sample_rows if row.get(col)})[:10]
        if unique_vals:
            col_samples[col] = unique_vals

    user = f"""Original user request: "{original_prompt}"

Failed Pandas code (attempt {attempt}):
```python
{failed_code}
```

Error message:
{error_message}

DataFrame columns: {headers}

Actual sample data (first 10 rows):
{json.dumps(sample_rows[:10], indent=2)}

Unique values found in date-like columns (showing real format variety):
{json.dumps(col_samples, indent=2)}

The error is likely caused by inconsistent date formats in the data (e.g. some rows have
YYYY/MM/DD, others have DD-MM-YYYY, etc). Fix the code to handle ALL formats robustly.

Key hints:
- Use pd.to_datetime(series, infer_datetime_format=True, errors='coerce') for mixed formats
- Use format='mixed' if available (pandas >= 2.0)
- After converting to datetime, use .dt.strftime('%d/%m/%Y') to format as string
- Use .fillna('') or handle NaT values after coerce

Generate corrected pandas code."""

    raw = await _call_claude(system, user, max_tokens=800)
    return _extract_json(raw)