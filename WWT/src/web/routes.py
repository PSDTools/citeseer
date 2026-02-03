"""FastAPI routes for the web UI."""

import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from ..ingestion.loader import load_all_csvs, get_tables, export_to_sqlite
from ..ingestion.profiler import profile_tables
from ..compiler.gemini import GeminiCompiler, CompilationError
from ..orchestration.executor import QueryExecutor, QueryLineage
from ..grafana.generator import DashboardGenerator
from ..grafana.api import GrafanaClient

router = APIRouter()

# Templates directory
TEMPLATES_DIR = Path(__file__).parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# Global state (in production, use proper dependency injection)
_compiler: Optional[GeminiCompiler] = None
_executor: Optional[QueryExecutor] = None
_lineage: QueryLineage = QueryLineage()
_generator: DashboardGenerator = DashboardGenerator()
_grafana: Optional[GrafanaClient] = None
_initialized: bool = False


def get_compiler() -> GeminiCompiler:
    """Get or initialize the compiler."""
    global _compiler, _initialized

    if not _initialized:
        initialize_app()

    if not _compiler:
        raise RuntimeError("Compiler not initialized. Check GEMINI_API_KEY.")

    return _compiler


def get_executor() -> QueryExecutor:
    """Get or initialize the executor."""
    global _executor, _initialized

    if not _initialized:
        initialize_app()

    if not _executor:
        _executor = QueryExecutor()

    return _executor


def initialize_app(data_dir: str = "./data", db_path: Optional[str] = None) -> None:
    """Initialize the application state."""
    global _compiler, _executor, _grafana, _initialized

    # Load data into DuckDB
    db_path = db_path or os.getenv("DUCKDB_PATH", "./data/analytics.duckdb")

    # Load CSVs
    tables = load_all_csvs(data_dir, db_path)
    print(f"Loaded tables: {tables}")

    # Export to SQLite for Grafana
    try:
        sqlite_path = export_to_sqlite(db_path)
        print(f"Exported to SQLite for Grafana: {sqlite_path}")
    except Exception as e:
        print(f"Failed to export to SQLite: {e}")

    # Profile tables
    profiles = profile_tables(db_path)

    # Initialize compiler
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        _compiler = GeminiCompiler(api_key=api_key, model_name=model_name, db_path=db_path)
        _compiler.set_schema(profiles)
        print(f"Compiler initialized with model: {model_name}")
    else:
        print("WARNING: GEMINI_API_KEY not set. Compiler disabled.")

    # Initialize executor
    _executor = QueryExecutor(db_path)

    # Initialize Grafana client
    _grafana = GrafanaClient()

    _initialized = True


@router.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Render the main page."""
    # Get available tables for display
    try:
        tables = get_tables()
    except Exception:
        tables = []

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "tables": tables,
            "history": _lineage.get_history(5),
        },
    )


@router.post("/ask", response_class=HTMLResponse)
async def ask_question(request: Request, question: str = Form(...)):
    """Process a natural language question."""
    try:
        compiler = get_compiler()
        executor = get_executor()

        # Compile the question
        plan = compiler.compile_question_sync(question)

        # Check if feasible
        if not plan.get("feasible", True):
            return templates.TemplateResponse(
                "components/refusal.html",
                {
                    "request": request,
                    "question": question,
                    "reason": plan.get("reason", "Cannot answer this question"),
                    "suggestions": plan.get("suggestions", []),
                },
            )

        # Execute the query
        result = executor.execute_plan(plan)

        # Record in lineage
        _lineage.record(question, plan, result)

        # Generate dashboard if Grafana is available
        dashboard_url = None
        if _grafana and _grafana.health_check():
            dashboard = _generator.generate_dashboard(plan)
            response = _grafana.create_dashboard(dashboard)
            if response.get("success"):
                dashboard_url = response.get("url")

        return templates.TemplateResponse(
            "components/result.html",
            {
                "request": request,
                "question": question,
                "plan": plan,
                "result": result,
                "dashboard_url": dashboard_url,
            },
        )

    except CompilationError as e:
        return templates.TemplateResponse(
            "components/error.html",
            {
                "request": request,
                "error": f"Compilation error: {e}",
            },
        )
    except Exception as e:
        return templates.TemplateResponse(
            "components/error.html",
            {
                "request": request,
                "error": str(e),
            },
        )


@router.post("/overview", response_class=HTMLResponse)
async def generate_overview(request: Request):
    """Generate an overview dashboard."""
    try:
        compiler = get_compiler()

        # Generate overview
        overview = compiler.generate_overview_sync()

        # Generate dashboard
        dashboard = _generator.generate_from_overview(overview)

        # Push to Grafana if available
        dashboard_url = None
        if _grafana and _grafana.health_check():
            response = _grafana.create_dashboard(dashboard)
            if response.get("success"):
                dashboard_url = response.get("url")

        return templates.TemplateResponse(
            "components/overview.html",
            {
                "request": request,
                "overview": overview,
                "dashboard_url": dashboard_url,
            },
        )

    except Exception as e:
        return templates.TemplateResponse(
            "components/error.html",
            {
                "request": request,
                "error": str(e),
            },
        )


@router.get("/health")
async def health():
    """Health check endpoint."""
    grafana_ok = _grafana.health_check() if _grafana else False

    return {
        "status": "ok",
        "initialized": _initialized,
        "compiler_ready": _compiler is not None,
        "grafana_connected": grafana_ok,
    }


@router.get("/tables", response_class=HTMLResponse)
async def list_tables(request: Request):
    """List available tables."""
    try:
        tables = get_tables()
        profiles = profile_tables()

        return templates.TemplateResponse(
            "components/tables.html",
            {
                "request": request,
                "profiles": profiles,
            },
        )
    except Exception as e:
        return templates.TemplateResponse(
            "components/error.html",
            {
                "request": request,
                "error": str(e),
            },
        )


@router.post("/refresh", response_class=HTMLResponse)
async def refresh_data(request: Request):
    """Refresh data from CSVs."""
    try:
        # Re-initialize application to reload data
        initialize_app()
        
        # Return updated tables list
        return await list_tables(request)
    except Exception as e:
        return templates.TemplateResponse(
            "components/error.html",
            {
                "request": request,
                "error": f"Failed to refresh data: {str(e)}",
            },
        )
