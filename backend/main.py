"""
DataFlow — FastAPI entry point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from config import settings
from models.database import Base, engine

from routers import projects, files, mapping, validation, transform, export

Base.metadata.create_all(bind=engine)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="DataFlow API",
    description="AI-powered data preparation and migration platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow all origins in development, specific origins in production.
# Set CORS_ORIGINS env var on Render to your frontend URL:
#   e.g. https://datamend-app.onrender.com,http://localhost:5173
raw_origins = settings.CORS_ORIGINS

# Build final list — always include localhost for local dev
origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
if "http://localhost:5173" not in origins:
    origins.append("http://localhost:5173")
if "http://localhost:3000" not in origins:
    origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Row-Count"],
)

app.include_router(projects.router,   prefix="/api/projects",   tags=["Projects"])
app.include_router(files.router,      prefix="/api/files",      tags=["Files"])
app.include_router(mapping.router,    prefix="/api/mapping",    tags=["Mapping"])
app.include_router(validation.router, prefix="/api/validation", tags=["Validation"])
app.include_router(transform.router,  prefix="/api/transform",  tags=["Transform"])
app.include_router(export.router,     prefix="/api/export",     tags=["Export"])


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/")
def root():
    return {"message": "DataFlow API is running", "docs": "/docs"}
