import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

# Determine Database URL (use SQLite by default in current directory, support PostgreSQL if environment variable is set)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///ecg_id.db")

# For SQLite, enable check_same_thread=False for async FastAPI compatibility
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # PostgreSQL configuration
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    templates = relationship("EcgTemplate", back_populates="user", cascade="all, delete-orphan")

class EcgTemplate(Base):
    __tablename__ = "ecg_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    template_json = Column(Text, nullable=False)  # JSON-serialized list of floats (embedding)
    filename = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="templates")

class AuthLog(Base):
    __tablename__ = "auth_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(20), nullable=False)  # 'AUTHENTICATION', 'REGISTRATION', 'FAILED_ATTEMPT'
    status = Column(String(20), nullable=False)      # 'AUTH_APPROVED', 'FAILED', 'VERIFICATION_ERROR'
    username = Column(String(100), nullable=True)
    accuracy = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
