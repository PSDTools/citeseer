"""Tests for the AI question compiler and validator."""

import pytest

from src.compiler.validator import (
    validate_plan,
    validate_sql_readonly,
    validate_table_references,
    validate_visualization,
    extract_columns_from_sql,
    ValidationError,
)


class TestSqlValidation:
    """Tests for SQL validation."""

    def test_valid_select(self):
        """Test valid SELECT queries pass."""
        sql = "SELECT * FROM shipments WHERE status = 'delayed'"
        validate_sql_readonly(sql)  # Should not raise

    def test_reject_insert(self):
        """Test INSERT is rejected."""
        sql = "INSERT INTO shipments VALUES (1, 2, 3)"
        with pytest.raises(ValidationError, match="INSERT"):
            validate_sql_readonly(sql)

    def test_reject_update(self):
        """Test UPDATE is rejected."""
        sql = "UPDATE shipments SET status = 'delivered' WHERE id = 1"
        with pytest.raises(ValidationError, match="UPDATE"):
            validate_sql_readonly(sql)

    def test_reject_delete(self):
        """Test DELETE is rejected."""
        sql = "DELETE FROM shipments WHERE id = 1"
        with pytest.raises(ValidationError, match="DELETE"):
            validate_sql_readonly(sql)

    def test_reject_drop(self):
        """Test DROP is rejected."""
        sql = "DROP TABLE shipments"
        with pytest.raises(ValidationError, match="DROP"):
            validate_sql_readonly(sql)

    def test_reject_truncate(self):
        """Test TRUNCATE is rejected."""
        sql = "TRUNCATE TABLE shipments"
        with pytest.raises(ValidationError, match="TRUNCATE"):
            validate_sql_readonly(sql)

    def test_case_insensitive(self):
        """Test validation is case insensitive."""
        sql = "insert INTO shipments VALUES (1)"
        with pytest.raises(ValidationError):
            validate_sql_readonly(sql)


class TestTableValidation:
    """Tests for table reference validation."""

    def test_valid_tables(self, mock_table_profiles):
        """Test valid table references."""
        tables = ["shipments", "inventory"]
        validate_table_references(tables, mock_table_profiles)  # Should not raise

    def test_invalid_table(self, mock_table_profiles):
        """Test invalid table reference."""
        tables = ["shipments", "nonexistent"]
        with pytest.raises(ValidationError, match="nonexistent"):
            validate_table_references(tables, mock_table_profiles)


class TestVisualizationValidation:
    """Tests for visualization validation."""

    def test_valid_bar_chart(self):
        """Test valid bar chart spec."""
        viz = {"type": "bar", "x": "origin", "y": "count"}
        sql = "SELECT origin, COUNT(*) as count FROM shipments GROUP BY origin"
        validate_visualization(viz, sql)  # Should not raise

    def test_invalid_viz_type(self):
        """Test invalid visualization type."""
        viz = {"type": "invalid_type", "x": "origin"}
        sql = "SELECT * FROM shipments"
        with pytest.raises(ValidationError, match="invalid_type"):
            validate_visualization(viz, sql)

    def test_valid_stat(self):
        """Test valid stat panel."""
        viz = {"type": "stat", "value": "total"}
        sql = "SELECT COUNT(*) as total FROM shipments"
        validate_visualization(viz, sql)  # Should not raise


class TestPlanValidation:
    """Tests for full plan validation."""

    def test_valid_plan(self, mock_table_profiles):
        """Test valid analytical plan."""
        plan = {
            "feasible": True,
            "tables": ["shipments"],
            "sql": "SELECT origin, COUNT(*) as delays FROM shipments GROUP BY origin",
            "viz": {"type": "bar", "x": "origin", "y": "delays"},
        }
        validate_plan(plan, mock_table_profiles)  # Should not raise

    def test_infeasible_plan_valid(self, mock_table_profiles):
        """Test infeasible plan doesn't need SQL."""
        plan = {
            "feasible": False,
            "reason": "No supplier data available",
        }
        validate_plan(plan, mock_table_profiles)  # Should not raise

    def test_feasible_plan_needs_sql(self, mock_table_profiles):
        """Test feasible plan requires SQL."""
        plan = {
            "feasible": True,
            "tables": ["shipments"],
            # Missing sql
        }
        with pytest.raises(ValidationError, match="no SQL"):
            validate_plan(plan, mock_table_profiles)


class TestColumnExtraction:
    """Tests for SQL column extraction."""

    def test_simple_select(self):
        """Test extracting columns from simple SELECT."""
        sql = "SELECT origin, destination FROM shipments"
        columns = extract_columns_from_sql(sql)

        assert "origin" in columns
        assert "destination" in columns

    def test_select_with_alias(self):
        """Test extracting columns with AS alias."""
        sql = "SELECT origin, COUNT(*) AS delay_count FROM shipments GROUP BY origin"
        columns = extract_columns_from_sql(sql)

        assert "origin" in columns
        assert "delay_count" in columns

    def test_select_with_function(self):
        """Test extracting columns with functions."""
        sql = "SELECT AVG(value_usd) as avg_value, SUM(weight_kg) total_weight FROM shipments"
        columns = extract_columns_from_sql(sql)

        assert "avg_value" in columns or "AVG" in columns
