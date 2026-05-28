from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from models.database import get_db, Project, Workbook
from models.schemas import ProjectCreate, ProjectUpdate, ProjectOut
from services.ai_service import ai_suggest_schema

router = APIRouter()


@router.get("/", response_model=List[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.created_at.desc()).all()


@router.post("/", response_model=ProjectOut)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    schema = [f.model_dump() for f in data.target_schema] if data.target_schema else None
    project = Project(
        name=data.name,
        description=data.description,
        target_schema=schema,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, data: ProjectUpdate, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    if data.name is not None:
        p.name = data.name
    if data.description is not None:
        p.description = data.description
    if data.target_schema is not None:
        p.target_schema = [f.model_dump() for f in data.target_schema]
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    db.delete(p)
    db.commit()
    return {"deleted": project_id}


@router.get("/{project_id}/workbooks")
def list_workbooks(project_id: str, db: Session = Depends(get_db)):
    return db.query(Workbook).filter(Workbook.project_id == project_id).all()
