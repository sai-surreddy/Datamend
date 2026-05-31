# DataFlow — Flatfile Clone (FastAPI + React)

A full-featured AI-powered data preparation and migration platform.

## Stack
- **Backend**: FastAPI + Pandas + NumPy + SQLAlchemy
- **Database**: PostgreSQL
- **Frontend**: React + Vite + TailwindCSS
- **AI**: Claude API (column mapping, transforms, autofix)
- **File Support**: CSV, Excel (.xlsx/.xls), JSON, TSV

## Features
- ✅ File ingestion & smart parsing (Pandas)
- ✅ AI-powered column mapping (Claude)
- ✅ Data validation engine (rules engine)
- ✅ AI Transform (natural language → Pandas operations)
- ✅ AutoFix (one-click error correction)
- ✅ Workbook UI (spreadsheet-like editor)
- ✅ Projects & workspaces
- ✅ Export (CSV, JSON, Excel)
- ✅ Webhook push to destination
- ✅ Collaboration (share projects)

## Quick Start

### 1. Clone & Setup Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials and Anthropic API key
```

### 3. Initialize Database
```bash
python init_db.py
```

### 4. Run Backend
```bash
uvicorn main:app --reload --port 8000
```

### 5. Setup & Run Frontend
```bash
cd ../frontend
npm install
npm run dev
```

### 6. Open App
Visit `http://localhost:5173`

## API Docs
Visit `http://localhost:8000/docs` for interactive Swagger UI.

## Project Structure
```
dataflow/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── requirements.txt
│   ├── .env.example
│   ├── init_db.py               # DB initializer
│   ├── models/
│   │   ├── database.py          # SQLAlchemy setup
│   │   └── schemas.py           # Pydantic models
│   ├── routers/
│   │   ├── projects.py          # Project CRUD
│   │   ├── files.py             # File upload & parsing
│   │   ├── mapping.py           # Column mapping
│   │   ├── validation.py        # Validation engine
│   │   ├── transform.py         # AI transforms & autofix
│   │   └── export.py            # Export & webhooks
│   ├── services/
│   │   ├── parser.py            # Pandas file parser
│   │   ├── validator.py         # Validation rules engine
│   │   ├── transformer.py       # Pandas transformations
│   │   ├── ai_service.py        # Claude API integration
│   │   └── export_service.py    # Export service
│   └── utils/
│       └── helpers.py
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── components/
        │   ├── Topbar.jsx
        │   ├── Sidebar.jsx
        │   ├── FileUpload.jsx
        │   ├── Workbook.jsx
        │   ├── MappingEditor.jsx
        │   ├── ValidationPanel.jsx
        │   ├── TransformPanel.jsx
        │   └── ExportPanel.jsx
        ├── pages/
        │   ├── Dashboard.jsx
        │   └── Project.jsx
        ├── hooks/
        │   ├── useProject.js
        │   └── useWorkbook.js
        └── utils/
            └── api.js
```
