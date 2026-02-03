"""Tests for data ingestion and profiling."""

import csv
import tempfile
from pathlib import Path

import pytest

from src.ingestion.loader import (
    load_csv_to_duckdb,
    get_tables,
    get_table_schema,
    execute_query,
)
from src.ingestion.profiler import (
    profile_table,
    profile_tables,
    generate_schema_context,
)


class TestDataLoader:
    """Tests for CSV loading."""

    @pytest.fixture
    def sample_csv(self, tmp_path):
        """Create a sample CSV file."""
        csv_path = tmp_path / "test.csv"
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["id", "name", "value", "created_at"])
            writer.writerow([1, "Item A", 100.5, "2024-01-01"])
            writer.writerow([2, "Item B", 200.0, "2024-01-02"])
            writer.writerow([3, "Item C", 150.75, "2024-01-03"])
        return csv_path

    def test_load_csv(self, sample_csv, temp_db):
        """Test loading a CSV file."""
        row_count = load_csv_to_duckdb(sample_csv, "test_table", temp_db)

        assert row_count == 3

    def test_get_tables(self, sample_csv, temp_db):
        """Test listing tables."""
        load_csv_to_duckdb(sample_csv, "test_table", temp_db)
        tables = get_tables(temp_db)

        assert "test_table" in tables

    def test_get_schema(self, sample_csv, temp_db):
        """Test getting table schema."""
        load_csv_to_duckdb(sample_csv, "test_table", temp_db)
        schema = get_table_schema("test_table", temp_db)

        column_names = [col["name"] for col in schema]
        assert "id" in column_names
        assert "name" in column_names
        assert "value" in column_names

    def test_execute_query(self, sample_csv, temp_db):
        """Test executing a query."""
        load_csv_to_duckdb(sample_csv, "test_table", temp_db)
        results = execute_query("SELECT * FROM test_table WHERE value > 150", temp_db)

        assert len(results) == 2
        assert all(row["value"] > 150 for row in results)


class TestDataProfiler:
    """Tests for data profiling."""

    @pytest.fixture
    def loaded_db(self, tmp_path):
        """Create a database with sample data."""
        db_path = str(tmp_path / "test.duckdb")

        # Create shipments CSV
        shipments_csv = tmp_path / "shipments.csv"
        with open(shipments_csv, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["id", "origin", "status", "ship_date", "value_usd"])
            for i in range(10):
                writer.writerow([
                    f"SHP-{i:04d}",
                    ["NYC", "LA", "CHI"][i % 3],
                    ["delivered", "delayed"][i % 2],
                    f"2024-01-{i+1:02d}",
                    100 * (i + 1),
                ])

        load_csv_to_duckdb(shipments_csv, "shipments", db_path)
        return db_path

    def test_profile_table(self, loaded_db):
        """Test profiling a table."""
        profile = profile_table("shipments", loaded_db)

        assert profile.name == "shipments"
        assert profile.row_count == 10
        assert len(profile.columns) == 5

    def test_detect_timestamp(self, loaded_db):
        """Test timestamp column detection."""
        profile = profile_table("shipments", loaded_db)

        assert "ship_date" in profile.timestamp_columns

    def test_detect_metric(self, loaded_db):
        """Test metric column detection."""
        profile = profile_table("shipments", loaded_db)

        assert "value_usd" in profile.metric_columns

    def test_detect_categorical(self, loaded_db):
        """Test categorical column detection."""
        profile = profile_table("shipments", loaded_db)

        # origin and status should be categorical (low cardinality)
        assert "origin" in profile.categorical_columns or "status" in profile.categorical_columns

    def test_detect_entity_id(self, loaded_db):
        """Test entity ID column detection."""
        profile = profile_table("shipments", loaded_db)

        assert "id" in profile.entity_columns

    def test_generate_schema_context(self, loaded_db):
        """Test generating schema context for LLM."""
        profiles = profile_tables(loaded_db)
        context = generate_schema_context(profiles)

        assert "@schemas{" in context
        assert "@table{" in context
        assert "shipments" in context
        assert "@col{" in context


class TestQueryExecution:
    """Tests for query execution."""

    @pytest.fixture
    def executor(self, tmp_path):
        """Create an executor with sample data."""
        from src.orchestration.executor import QueryExecutor

        db_path = str(tmp_path / "test.duckdb")

        # Create sample data
        csv_path = tmp_path / "data.csv"
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["id", "category", "value"])
            for i in range(5):
                writer.writerow([i, ["A", "B"][i % 2], i * 10])

        load_csv_to_duckdb(csv_path, "data", db_path)

        return QueryExecutor(db_path)

    def test_execute_valid_query(self, executor):
        """Test executing a valid query."""
        result = executor.execute("SELECT * FROM data")

        assert result.success is True
        assert result.row_count == 5
        assert len(result.columns) == 3

    def test_execute_aggregation(self, executor):
        """Test executing an aggregation query."""
        result = executor.execute("SELECT category, SUM(value) as total FROM data GROUP BY category")

        assert result.success is True
        assert result.row_count == 2
        assert "total" in result.columns

    def test_reject_write_query(self, executor):
        """Test that write queries are rejected."""
        result = executor.execute("INSERT INTO data VALUES (99, 'X', 999)")

        assert result.success is False
        assert "INSERT" in result.error

    def test_handle_invalid_sql(self, executor):
        """Test handling invalid SQL."""
        result = executor.execute("SELECT * FROM nonexistent_table")

        assert result.success is False
        assert result.error is not None
