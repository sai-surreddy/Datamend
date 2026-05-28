"""Run once to create tables and seed a sample project."""
from models.database import Base, engine, SessionLocal, Project

Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Seed a sample project
existing = db.query(Project).first()
if not existing:
    sample = Project(
        name="Sample CRM Migration",
        description="Migrate customer data from legacy CRM",
        target_schema=[
            {"key": "id", "label": "ID", "type": "integer", "required": True},
            {"key": "full_name", "label": "Full Name", "type": "string", "required": True},
            {"key": "email", "label": "Email", "type": "email", "required": True},
            {"key": "phone", "label": "Phone", "type": "phone", "required": False},
            {"key": "company", "label": "Company", "type": "string", "required": False},
            {"key": "age", "label": "Age", "type": "integer", "required": False},
            {"key": "country", "label": "Country", "type": "string", "required": False},
            {"key": "status", "label": "Status", "type": "enum", "required": False,
             "enum_values": ["active", "inactive", "pending"]},
        ],
    )
    db.add(sample)
    db.commit()
    print(f"✓ Created sample project: {sample.id}")

db.close()
print("✓ Database initialized successfully")
