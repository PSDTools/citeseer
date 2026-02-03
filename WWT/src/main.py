"""FastAPI application entry point."""

import os
from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .web.routes import router, initialize_app

# Load environment variables
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Initialize on startup
    data_dir = os.getenv("DATA_DIR", "./data")
    db_path = os.getenv("DUCKDB_PATH", "./data/analytics.duckdb")

    print(f"Initializing application...")
    print(f"  Data directory: {data_dir}")
    print(f"  Database path: {db_path}")

    initialize_app(data_dir=data_dir, db_path=db_path)

    print("Application initialized!")

    yield

    # Cleanup on shutdown (if needed)
    print("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="Question-Driven Analytics",
    description="Ask natural language questions about your supply chain data",
    version="0.1.0",
    lifespan=lifespan,
)

# Include routes
app.include_router(router)


def run():
    """Entry point for the application."""
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )


if __name__ == "__main__":
    run()
