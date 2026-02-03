"""Tests for Grafana dashboard generation."""

import pytest

from src.grafana.generator import DashboardGenerator, generate_uid


class TestDashboardGenerator:
    """Tests for Grafana dashboard generation."""

    @pytest.fixture
    def generator(self):
        """Create a dashboard generator."""
        return DashboardGenerator(datasource_name="TestDS")

    def test_generate_bar_panel(self, generator):
        """Test generating a bar chart panel."""
        panel_spec = {
            "type": "bar",
            "title": "Delays by Origin",
            "x": "origin",
            "y": "delay_count",
        }
        sql = "SELECT origin, COUNT(*) as delay_count FROM shipments GROUP BY origin"
        grid_pos = {"x": 0, "y": 0, "w": 12, "h": 8}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "barchart"
        assert panel["title"] == "Delays by Origin"
        assert panel["gridPos"] == grid_pos
        assert panel["targets"][0]["queryText"].startswith("SELECT CAST(origin AS VARCHAR)")

    def test_generate_line_panel(self, generator):
        """Test generating a line chart panel."""
        panel_spec = {
            "type": "line",
            "title": "Delays Over Time",
        }
        sql = "SELECT ship_date, COUNT(*) FROM shipments GROUP BY ship_date"
        grid_pos = {"x": 0, "y": 0, "w": 24, "h": 8}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "timeseries"
        assert panel["title"] == "Delays Over Time"

    def test_generate_stat_panel(self, generator):
        """Test generating a stat panel."""
        panel_spec = {
            "type": "stat",
            "title": "Total Shipments",
            "value": "total",
        }
        sql = "SELECT COUNT(*) as total FROM shipments"
        grid_pos = {"x": 0, "y": 0, "w": 6, "h": 4}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "stat"
        assert "reduceOptions" in panel["options"]

    def test_generate_table_panel(self, generator):
        """Test generating a table panel."""
        panel_spec = {
            "type": "table",
            "title": "Recent Shipments",
        }
        sql = "SELECT * FROM shipments LIMIT 10"
        grid_pos = {"x": 0, "y": 0, "w": 24, "h": 10}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "table"
        assert panel["options"]["showHeader"] is True

    def test_generate_dashboard_from_plan(self, generator):
        """Test generating a full dashboard from a plan."""
        plan = {
            "q": "Where are delays?",
            "sql": "SELECT origin, COUNT(*) as delays FROM shipments GROUP BY origin",
            "viz": {
                "type": "bar",
                "title": "Delays by Origin",
                "x": "origin",
                "y": "delays",
            },
        }

        dashboard = generator.generate_dashboard(plan)

        assert "uid" in dashboard
        assert dashboard["title"] == "Delays by Origin"
        assert "auto-generated" in dashboard["tags"]
        assert len(dashboard["panels"]) == 1
        assert dashboard["panels"][0]["type"] == "barchart"

    def test_generate_multi_panel_dashboard(self, generator):
        """Test generating a dashboard with multiple panels."""
        panels = [
            {
                "viz": {"type": "stat", "title": "Total"},
                "sql": "SELECT COUNT(*) FROM shipments",
            },
            {
                "viz": {"type": "bar", "title": "By Origin"},
                "sql": "SELECT origin, COUNT(*) FROM shipments GROUP BY origin",
            },
            {
                "viz": {"type": "table", "title": "Recent"},
                "sql": "SELECT * FROM shipments LIMIT 5",
            },
        ]

        dashboard = generator.generate_multi_panel_dashboard(panels, "Test Dashboard")

        assert dashboard["title"] == "Test Dashboard"
        assert len(dashboard["panels"]) == 3

    def test_unique_uids(self):
        """Test that generated UIDs are unique."""
        uids = [generate_uid() for _ in range(100)]
        assert len(uids) == len(set(uids))

    def test_dashboard_schema_version(self, generator):
        """Test dashboard has correct schema version."""
        plan = {
            "q": "Test",
            "sql": "SELECT 1",
            "viz": {"type": "stat"},
        }

        dashboard = generator.generate_dashboard(plan)

        assert dashboard["schemaVersion"] >= 38

    def test_generate_from_overview(self, generator):
        """Test generating dashboard from overview spec."""
        overview = {
            "title": "Supply Chain Overview",
            "panels": [
                {"type": "stat", "title": "Total Shipments", "sql": "SELECT COUNT(*) FROM shipments"},
                {"type": "bar", "title": "By Status", "sql": "SELECT status, COUNT(*) FROM shipments GROUP BY status"},
            ],
        }

        dashboard = generator.generate_from_overview(overview)

        assert dashboard["title"] == "Supply Chain Overview"
        assert "overview" in dashboard["tags"]
        assert len(dashboard["panels"]) == 2

    def test_generate_pie_panel(self, generator):
        """Test generating a pie chart panel."""
        panel_spec = {
            "type": "pie",
            "title": "Status Distribution",
        }
        sql = "SELECT status, COUNT(*) as count FROM shipments GROUP BY status"
        grid_pos = {"x": 0, "y": 0, "w": 12, "h": 8}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "piechart"
        assert "reduceOptions" in panel["options"]

    def test_generate_gauge_panel(self, generator):
        """Test generating a gauge panel."""
        panel_spec = {
            "type": "gauge",
            "title": "On-Time Rate",
        }
        sql = "SELECT AVG(on_time) as rate FROM shipments"
        grid_pos = {"x": 0, "y": 0, "w": 6, "h": 6}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "gauge"
        assert "thresholds" in panel["fieldConfig"]["defaults"]

    def test_generate_heatmap_panel(self, generator):
        """Test generating a heatmap panel."""
        panel_spec = {
            "type": "heatmap",
            "title": "Activity by Day and Hour",
        }
        sql = "SELECT day, hour, count FROM activity_matrix"
        grid_pos = {"x": 0, "y": 0, "w": 24, "h": 8}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "heatmap"
        assert "color" in panel["options"]
        assert panel["options"]["color"]["scheme"] == "Oranges"

    def test_generate_histogram_panel(self, generator):
        """Test generating a histogram panel."""
        panel_spec = {
            "type": "histogram",
            "title": "Delivery Time Distribution",
        }
        sql = "SELECT delivery_hours FROM shipments"
        grid_pos = {"x": 0, "y": 0, "w": 12, "h": 8}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "histogram"
        assert "bucketCount" in panel["options"]

    def test_generate_state_timeline_panel(self, generator):
        """Test generating a state timeline panel."""
        panel_spec = {
            "type": "state_timeline",
            "title": "Shipment Status Over Time",
        }
        sql = "SELECT timestamp, shipment_id, status FROM status_log"
        grid_pos = {"x": 0, "y": 0, "w": 24, "h": 8}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "state-timeline"
        assert panel["options"]["mergeValues"] is True

    def test_generate_status_history_panel(self, generator):
        """Test generating a status history panel."""
        panel_spec = {
            "type": "status_history",
            "title": "System Health Grid",
        }
        sql = "SELECT timestamp, service, health FROM health_checks"
        grid_pos = {"x": 0, "y": 0, "w": 24, "h": 8}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "status-history"
        assert "rowHeight" in panel["options"]

    def test_generate_candlestick_panel(self, generator):
        """Test generating a candlestick panel."""
        panel_spec = {
            "type": "candlestick",
            "title": "Price Movement",
        }
        sql = "SELECT date, open, high, low, close FROM prices"
        grid_pos = {"x": 0, "y": 0, "w": 24, "h": 10}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "candlestick"
        assert "colors" in panel["options"]
        assert panel["options"]["colors"]["up"] == "green"

    def test_generate_trend_panel(self, generator):
        """Test generating a trend panel."""
        panel_spec = {
            "type": "trend",
            "title": "Performance by Sequence",
        }
        sql = "SELECT seq_num, metric FROM ordered_data"
        grid_pos = {"x": 0, "y": 0, "w": 24, "h": 8}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "trend"
        assert "lineWidth" in panel["fieldConfig"]["defaults"]["custom"]

    def test_generate_xy_panel(self, generator):
        """Test generating an XY scatter plot panel."""
        panel_spec = {
            "type": "xy",
            "title": "Weight vs Cost Correlation",
        }
        sql = "SELECT weight, cost FROM shipments"
        grid_pos = {"x": 0, "y": 0, "w": 12, "h": 10}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "xychart"
        assert "dims" in panel["options"]

    def test_generate_bar_gauge_panel(self, generator):
        """Test generating a bar gauge panel."""
        panel_spec = {
            "type": "bar_gauge",
            "title": "Carrier Performance",
        }
        sql = "SELECT carrier, on_time_rate FROM carrier_stats"
        grid_pos = {"x": 0, "y": 0, "w": 12, "h": 6}

        panel = generator.generate_panel(panel_spec, sql, grid_pos)

        assert panel["type"] == "bargauge"
        assert panel["options"]["orientation"] == "horizontal"
        assert "showUnfilled" in panel["options"]

