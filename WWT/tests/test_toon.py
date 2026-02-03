"""Tests for TOON parser and serializer."""

import pytest

from src.toon.parser import parse_toon, ToonParseError
from src.toon.serializer import serialize_toon, to_toon
from src.toon.schemas import AnalyticalPlan, PanelSpec


class TestToonParser:
    """Tests for TOON parser."""

    def test_parse_simple_object(self):
        """Test parsing a simple object."""
        toon = '@plan{q:"What is x?" feasible:true}'
        result = parse_toon(toon)

        assert result["_type"] == "plan"
        assert result["q"] == "What is x?"
        assert result["feasible"] is True

    def test_parse_array(self):
        """Test parsing arrays."""
        toon = "@plan{tables:[a,b,c]}"
        result = parse_toon(toon)

        assert result["tables"] == ["a", "b", "c"]

    def test_parse_nested_object(self):
        """Test parsing nested objects."""
        toon = '@plan{viz:@panel{type:bar x:origin}}'
        result = parse_toon(toon)

        assert result["viz"]["_type"] == "panel"
        assert result["viz"]["type"] == "bar"
        assert result["viz"]["x"] == "origin"

    def test_parse_numbers(self):
        """Test parsing numbers."""
        toon = "@data{count:42 rate:3.14}"
        result = parse_toon(toon)

        assert result["count"] == 42
        assert result["rate"] == 3.14

    def test_parse_booleans(self):
        """Test parsing booleans."""
        toon = "@data{active:true disabled:false}"
        result = parse_toon(toon)

        assert result["active"] is True
        assert result["disabled"] is False

    def test_parse_quoted_strings(self):
        """Test parsing quoted strings with spaces."""
        toon = '@plan{q:"Where are delays?" title:"My Dashboard"}'
        result = parse_toon(toon)

        assert result["q"] == "Where are delays?"
        assert result["title"] == "My Dashboard"

    def test_parse_sql_string(self):
        """Test parsing SQL strings with special characters."""
        toon = '@plan{sql:"SELECT * FROM table WHERE status=\'delayed\'"}'
        result = parse_toon(toon)

        assert "SELECT * FROM table" in result["sql"]

    def test_parse_full_plan(self, sample_toon_plan):
        """Test parsing a full analytical plan."""
        result = parse_toon(sample_toon_plan)

        assert result["_type"] == "plan"
        assert result["q"] == "Where are delivery delays?"
        assert result["feasible"] is True
        assert "shipments" in result["tables"]
        assert "events" in result["tables"]
        assert "SELECT" in result["sql"]
        assert result["viz"]["type"] == "bar"

    def test_parse_empty_array(self):
        """Test parsing empty arrays."""
        toon = "@plan{items:[]}"
        result = parse_toon(toon)

        assert result["items"] == []


class TestToonSerializer:
    """Tests for TOON serializer."""

    def test_serialize_simple_object(self):
        """Test serializing a simple object."""
        data = {"_type": "plan", "q": "What?", "feasible": True}
        result = serialize_toon(data, compact=True)

        assert "@plan{" in result
        assert "q:What?" in result
        assert "feasible:true" in result

    def test_serialize_array(self):
        """Test serializing arrays."""
        data = {"_type": "plan", "tables": ["a", "b", "c"]}
        result = serialize_toon(data, compact=True)

        assert "[a,b,c]" in result

    def test_serialize_nested_object(self):
        """Test serializing nested objects."""
        data = {
            "_type": "plan",
            "viz": {"_type": "panel", "type": "bar"},
        }
        result = serialize_toon(data, compact=True)

        assert "@panel{" in result
        assert "type:bar" in result

    def test_serialize_quoted_string(self):
        """Test serializing strings that need quotes."""
        data = {"_type": "plan", "q": "Where are delays?"}
        result = serialize_toon(data, compact=True)

        assert '"Where are delays?"' in result

    def test_round_trip(self, sample_plan_dict):
        """Test parse -> serialize -> parse round trip."""
        serialized = serialize_toon(sample_plan_dict, compact=True)
        parsed = parse_toon(serialized)

        assert parsed["q"] == sample_plan_dict["q"]
        assert parsed["feasible"] == sample_plan_dict["feasible"]
        assert parsed["tables"] == sample_plan_dict["tables"]


class TestToonSchemas:
    """Tests for TOON Pydantic schemas."""

    def test_panel_spec(self):
        """Test PanelSpec model."""
        panel = PanelSpec(type="bar", x="origin", y="count", title="Test")

        assert panel.type == "bar"
        assert panel.x == "origin"
        assert panel.y == "count"

    def test_analytical_plan(self):
        """Test AnalyticalPlan model."""
        plan = AnalyticalPlan(
            q="Test question",
            feasible=True,
            tables=["shipments"],
            sql="SELECT * FROM shipments",
        )

        assert plan.question == "Test question"
        assert plan.feasible is True
        assert plan.tables == ["shipments"]

    def test_to_toon_from_model(self):
        """Test converting Pydantic model to TOON."""
        panel = PanelSpec(type="bar", x="origin", y="count")
        result = to_toon(panel, "panel", compact=True)

        assert "@panel{" in result
        assert "type:bar" in result
