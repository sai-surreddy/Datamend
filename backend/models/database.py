from sqlalchemy import create_engine, Column, String, Integer, DateTime, Text, JSON, ForeignKey, Float, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import uuid
from config import settings

# engine = create_engine(settings.DATABASE_URL)
from sqlalchemy.pool import StaticPool

# SQLite needs special args for same-thread usage with FastAPI
if settings.DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def generate_id():
    return str(uuid.uuid4())


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=generate_id)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    target_schema = Column(JSON, nullable=True)   # list of field definitions
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workbooks = relationship("Workbook", back_populates="project", cascade="all, delete")
    webhooks = relationship("Webhook", back_populates="project", cascade="all, delete")


class Workbook(Base):
    __tablename__ = "workbooks"

    id = Column(String, primary_key=True, default=generate_id)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    original_filename = Column(String(255))
    file_path = Column(String(512))           # path on disk
    file_type = Column(String(20))            # csv, xlsx, json, tsv
    row_count = Column(Integer, default=0)
    col_count = Column(Integer, default=0)
    source_headers = Column(JSON)             # original column names
    column_mapping = Column(JSON)             # {source_col: target_field}
    validation_rules = Column(JSON)           # custom rules
    validation_summary = Column(JSON)         # last validation results summary
    status = Column(String(50), default="uploaded")  # uploaded|mapped|validated|exported
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="workbooks")
    transforms = relationship("Transform", back_populates="workbook", cascade="all, delete")


class Transform(Base):
    __tablename__ = "transforms"

    id = Column(String, primary_key=True, default=generate_id)
    workbook_id = Column(String, ForeignKey("workbooks.id"), nullable=False)
    type = Column(String(50))                 # ai_transform | autofix | manual
    prompt = Column(Text, nullable=True)      # user prompt for AI transforms
    pandas_code = Column(Text, nullable=True) # generated pandas code
    columns_affected = Column(JSON)
    rows_affected = Column(Integer, default=0)
    applied = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    workbook = relationship("Workbook", back_populates="transforms")


class Webhook(Base):
    __tablename__ = "webhooks"

    id = Column(String, primary_key=True, default=generate_id)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    name = Column(String(255))
    url = Column(String(512), nullable=False)
    secret = Column(String(255), nullable=True)
    events = Column(JSON)                     # ["export.complete", "validation.done"]
    active = Column(Boolean, default=True)
    last_triggered = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="webhooks")
