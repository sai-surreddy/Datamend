from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/dataflow"
    DATABASE_URL: str = "sqlite:///./dataflow.db"
    NVIDIA_API_KEY: str = "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"
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    NVIDIA_MODEL: str = "meta/llama-3.1-70b-instruct"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,https://dataflow-app.onrender.com"
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 50

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
