"""
DataFlow — FastAPI entry point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from config import settings
from models.database import Base, engine

# Import all routers
from routers import projects, files, mapping, validation, transform, export

# Create DB tables
Base.metadata.create_all(bind=engine)

# Ensure upload dir exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="DataFlow API",
    description="AI-powered data preparation and migration platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(files.router, prefix="/api/files", tags=["Files"])
app.include_router(mapping.router, prefix="/api/mapping", tags=["Mapping"])
app.include_router(validation.router, prefix="/api/validation", tags=["Validation"])
app.include_router(transform.router, prefix="/api/transform", tags=["Transform"])
app.include_router(export.router, prefix="/api/export", tags=["Export"])


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
