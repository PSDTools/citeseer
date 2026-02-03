"""Data ingestion and profiling."""

from .loader import load_csv_to_duckdb, get_connection
from .profiler import profile_tables, TableProfile

__all__ = ["load_csv_to_duckdb", "get_connection", "profile_tables", "TableProfile"]
