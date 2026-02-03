"""Pytest configuration and fixtures."""

import os
import tempfile
from pathlib import Path

import pytest

# Set test environment
os.environ["DUCKDB_PATH"] = ":memory:"
os.environ["GEMINI_API_KEY"] = "test-key"


@pytest.fixture
def sample_toon_plan():
    """Sample TOON plan string."""
    return '''@plan{
  q:"Where are delivery delays?"
  feasible:true
  tables:[shipments,events]
  sql:"SELECT origin, COUNT(*) as delays FROM shipments WHERE status='delayed' GROUP BY origin"
  viz:@panel{type:bar x:origin y:delays title:"Delays by Origin"}
}'''


@pytest.fixture
def sample_plan_dict():
    """Sample plan as Python dict."""
    return {
        "_type": "plan",
        "q": "Where are delivery delays?",
        "feasible": True,
        "tables": ["shipments", "events"],
        "sql": "SELECT origin, COUNT(*) as delays FROM shipments WHERE status='delayed' GROUP BY origin",
        "viz": {
            "_type": "panel",
            "type": "bar",
            "x": "origin",
            "y": "delays",
            "title": "Delays by Origin",
        },
    }


@pytest.fixture
def temp_db(tmp_path):
    """Temporary DuckDB database."""
    db_path = str(tmp_path / "test.duckdb")
    yield db_path


@pytest.fixture
def mock_table_profiles():
    """Mock table profiles for testing."""
    from src.ingestion.profiler import TableProfile, ColumnProfile

    return {
        "shipments": TableProfile(
            name="shipments",
            row_count=1000,
            columns=[
                ColumnProfile(name="id", dtype="VARCHAR", is_entity_id=True),
                ColumnProfile(name="origin", dtype="VARCHAR", is_categorical=True),
                ColumnProfile(name="destination", dtype="VARCHAR", is_categorical=True),
                ColumnProfile(name="carrier", dtype="VARCHAR", is_categorical=True),
                ColumnProfile(name="status", dtype="VARCHAR", is_categorical=True),
                ColumnProfile(name="ship_date", dtype="DATE", is_timestamp=True),
                ColumnProfile(name="deliver_date", dtype="DATE", is_timestamp=True),
                ColumnProfile(name="weight_kg", dtype="DOUBLE", is_metric=True),
                ColumnProfile(name="value_usd", dtype="DOUBLE", is_metric=True),
            ],
        ),
        "inventory": TableProfile(
            name="inventory",
            row_count=500,
            columns=[
                ColumnProfile(name="id", dtype="VARCHAR", is_entity_id=True),
                ColumnProfile(name="location", dtype="VARCHAR", is_categorical=True),
                ColumnProfile(name="sku", dtype="VARCHAR", is_categorical=True),
                ColumnProfile(name="quantity", dtype="INTEGER", is_metric=True),
                ColumnProfile(name="reorder_point", dtype="INTEGER", is_metric=True),
                ColumnProfile(name="last_updated", dtype="TIMESTAMP", is_timestamp=True),
            ],
        ),
        "events": TableProfile(
            name="events",
            row_count=2000,
            columns=[
                ColumnProfile(name="id", dtype="VARCHAR", is_entity_id=True),
                ColumnProfile(name="timestamp", dtype="TIMESTAMP", is_timestamp=True),
                ColumnProfile(name="entity_type", dtype="VARCHAR", is_categorical=True),
                ColumnProfile(name="entity_id", dtype="VARCHAR", is_entity_id=True),
                ColumnProfile(name="event_type", dtype="VARCHAR", is_categorical=True),
                ColumnProfile(name="details", dtype="VARCHAR"),
            ],
        ),
    }
