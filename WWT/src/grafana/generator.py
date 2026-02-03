"""Generate Grafana dashboard JSON from TOON specifications."""

import re
import uuid
from typing import Any, Dict, List, Optional

# Common timestamp column names to auto-detect
TIME_COLUMN_PATTERNS = [
    r'\b(created_at|updated_at|timestamp|datetime|date|time)\b',
    r'\b(\w+_at|at_\w+)\b',  # Pattern like shipped_at, created_at
    r'\b(\w+_date|date_\w+)\b',  # Pattern like ship_date, order_date
    r'\b(\w+_time|time_\w+)\b',  # Pattern like start_time
]


def normalize_time_columns(sql: str, x_column: Optional[str] = None) -> str:
    """
    Auto-normalize time columns in SQL for bar charts.
    
    Wraps detected time columns with strftime() to convert to string format.
    This ensures bar charts render correctly in Grafana.
    
    Args:
        sql: The SQL query
        x_column: The x-axis column name (if known)
    
    Returns:
        SQL with time columns wrapped in strftime()
    """
    if not sql or not x_column:
        return sql
    
    x_lower = x_column.lower()
    time_keywords = ['date', 'time', 'created', 'updated', 'at', 'timestamp', 'datetime', 'when']
    
    # Check if x_column looks like a time column
    if not any(kw in x_lower for kw in time_keywords):
        return sql
    
    # Check if already wrapped in strftime
    if f"strftime({x_column}" in sql.lower() or f"strftime( {x_column}" in sql.lower():
        return sql
    
    # Simple approach: replace the column name after SELECT with strftime version
    # Find "SELECT ... x_column" and wrap x_column
    # Pattern matches: SELECT <stuff> column_name or SELECT column_name
    pattern = rf'(SELECT\s+)([\w\s,.\(\)\'\"*]+,\s*)?({re.escape(x_column)})(\s*[,\s])'
    
    def replacer(match):
        prefix = match.group(1)
        between = match.group(2) or ''
        col = match.group(3)
        suffix = match.group(4)
        return f"{prefix}{between}strftime({col}, '%Y-%m-%d') AS {col}{suffix}"
    
    result = re.sub(pattern, replacer, sql, count=1, flags=re.IGNORECASE)
    
    # If the column is the first thing after SELECT (no comma before)
    if result == sql:
        pattern2 = rf'(SELECT\s+)({re.escape(x_column)})(\s*[,\s])'
        result = re.sub(pattern2, 
                       lambda m: f"{m.group(1)}strftime({m.group(2)}, '%Y-%m-%d') AS {m.group(2)}{m.group(3)}", 
                       sql, count=1, flags=re.IGNORECASE)
    
    return result


def generate_panel_id() -> int:
    """Generate a unique panel ID."""
    return abs(hash(uuid.uuid4())) % 1000000


def generate_uid() -> str:
    """Generate a unique dashboard UID."""
    return uuid.uuid4().hex[:12]


class DashboardGenerator:
    """Generate Grafana dashboard JSON from analytical plans."""

    def __init__(self, datasource_name: str = "DuckDB"):
        """
        Initialize the generator.

        Args:
            datasource_name: Name of the Grafana datasource
        """
        self.datasource_name = datasource_name

    def generate_panel(
        self,
        panel_spec: Dict[str, Any],
        sql: str,
        grid_pos: Dict[str, int],
    ) -> Dict[str, Any]:
        """
        Generate a Grafana panel from a TOON panel spec.

        Args:
            panel_spec: Panel specification from TOON
            sql: SQL query for the panel
            grid_pos: Grid position {x, y, w, h}

        Returns:
            Grafana panel JSON
        """
        panel_type = panel_spec.get("type", "bar")
        title = panel_spec.get("title", "Panel")

        # Base panel structure
        panel: Dict[str, Any] = {
            "id": generate_panel_id(),
            "title": title,
            "description": panel_spec.get("description", ""),  # Add description
            "gridPos": grid_pos,
            "datasource": {"type": "frser-sqlite-datasource", "uid": self.datasource_name},
            "targets": [
                {
                    "queryText": sql,
                    "rawQueryText": sql,
                    "refId": "A",
                    "format": "table",
                }
            ],
        }

        # Set panel type and options based on visualization type
        if panel_type == "bar":
            # Get x column - try from spec, or extract first column from SQL
            x_col = panel_spec.get("x")
            
            # If no x column specified, try to extract from SQL
            if not x_col:
                # Look for first column in SELECT
                select_match = re.search(r'SELECT\s+(\w+)', sql, re.IGNORECASE)
                if select_match:
                    x_col = select_match.group(1)
            
            # Auto-normalize time columns for bar charts
            normalized_sql = normalize_time_columns(sql, x_col) if x_col else sql
            
            # CRITICAL: Cast the first column to VARCHAR in SQL to ensure string type
            # This is the most reliable way to ensure Grafana treats it as categorical
            if x_col and x_col.lower() != 'strftime':
                # Wrap with CAST to ensure string type if not already wrapped
                if f"CAST({x_col}" not in normalized_sql and f"strftime({x_col}" not in normalized_sql.lower():
                    # If we already applied strftime, no need for CAST
                    if normalized_sql == sql:
                        # Apply CAST AS VARCHAR
                        pattern = rf'(SELECT\s+)({re.escape(x_col)})(\s*[,\s])'
                        normalized_sql = re.sub(
                            pattern,
                            lambda m: f"{m.group(1)}CAST({m.group(2)} AS VARCHAR) AS {m.group(2)}{m.group(3)}",
                            sql, count=1, flags=re.IGNORECASE
                        )
            
            panel["targets"][0]["queryText"] = normalized_sql
            panel["targets"][0]["rawQueryText"] = normalized_sql
            
            panel["type"] = "barchart"
            panel["options"] = {
                "legend": {"displayMode": "list", "placement": "bottom"},
                "tooltip": {"mode": "single"},
            }
            
            # Critical: Configure xField explicitly for bar charts
            if x_col:
                panel["options"]["xField"] = x_col
            
            panel["fieldConfig"] = {
                "defaults": {"color": {"mode": "palette-classic"}},
                "overrides": [],
            }

        elif panel_type == "line":
            panel["type"] = "timeseries"
            panel["options"] = {
                "legend": {"displayMode": "list", "placement": "bottom"},
                "tooltip": {"mode": "single"},
            }
            panel["fieldConfig"] = {
                "defaults": {
                    "color": {"mode": "palette-classic"},
                    "custom": {
                        "lineWidth": 2,
                        "fillOpacity": 10,
                        "pointSize": 5,
                    },
                },
                "overrides": [],
            }

        elif panel_type == "stat":
            panel["type"] = "stat"
            panel["options"] = {
                "colorMode": "value",
                "graphMode": "area",
                "justifyMode": "auto",
                "textMode": "auto",
                "reduceOptions": {
                    "calcs": ["lastNotNull"],
                    "fields": "",
                    "values": False,
                },
            }
            panel["fieldConfig"] = {
                "defaults": {"color": {"mode": "thresholds"}},
                "overrides": [],
            }

        elif panel_type == "table":
            panel["type"] = "table"
            panel["options"] = {
                "showHeader": True,
                "sortBy": [],
            }
            panel["fieldConfig"] = {
                "defaults": {},
                "overrides": [],
            }

        elif panel_type == "pie":
            panel["type"] = "piechart"
            panel["options"] = {
                "legend": {"displayMode": "list", "placement": "right"},
                "pieType": "pie",
                "reduceOptions": {
                    "calcs": ["lastNotNull"],
                    "fields": "",
                    "values": True,
                },
            }
            panel["fieldConfig"] = {
                "defaults": {"color": {"mode": "palette-classic"}},
                "overrides": [],
            }

        elif panel_type == "gauge":
            panel["type"] = "gauge"
            panel["options"] = {
                "reduceOptions": {
                    "calcs": ["lastNotNull"],
                    "fields": "",
                    "values": False,
                },
                "showThresholdLabels": False,
                "showThresholdMarkers": True,
            }
            panel["fieldConfig"] = {
                "defaults": {
                    "color": {"mode": "thresholds"},
                    "thresholds": {
                        "mode": "absolute",
                        "steps": [
                            {"color": "green", "value": None},
                            {"color": "yellow", "value": 50},
                            {"color": "red", "value": 80},
                        ],
                    },
                },
                "overrides": [],
            }

        elif panel_type == "heatmap":
            panel["type"] = "heatmap"
            panel["options"] = {
                "calculate": False,
                "cellGap": 1,
                "color": {
                    "mode": "scheme",
                    "scheme": "Oranges",
                    "steps": 64,
                },
                "legend": {"show": True},
                "tooltip": {"show": True, "yHistogram": False},
                "yAxis": {"unit": "short"},
            }
            panel["fieldConfig"] = {
                "defaults": {"custom": {"hideFrom": {"legend": False, "tooltip": False, "viz": False}}},
                "overrides": [],
            }

        elif panel_type == "histogram":
            panel["type"] = "histogram"
            panel["options"] = {
                "bucketCount": 30,
                "bucketSize": None,
                "combine": False,
                "legend": {"displayMode": "list", "placement": "bottom"},
                "tooltip": {"mode": "single"},
            }
            panel["fieldConfig"] = {
                "defaults": {
                    "color": {"mode": "palette-classic"},
                    "custom": {"fillOpacity": 80, "lineWidth": 1},
                },
                "overrides": [],
            }

        elif panel_type == "state_timeline":
            panel["type"] = "state-timeline"
            panel["options"] = {
                "alignValue": "left",
                "legend": {"displayMode": "list", "placement": "bottom"},
                "mergeValues": True,
                "rowHeight": 0.9,
                "showValue": "auto",
                "tooltip": {"mode": "single"},
            }
            panel["fieldConfig"] = {
                "defaults": {
                    "color": {"mode": "palette-classic"},
                    "custom": {"fillOpacity": 70, "lineWidth": 0},
                },
                "overrides": [],
            }

        elif panel_type == "status_history":
            panel["type"] = "status-history"
            panel["options"] = {
                "colWidth": 0.9,
                "legend": {"displayMode": "list", "placement": "bottom"},
                "rowHeight": 0.9,
                "showValue": "auto",
                "tooltip": {"mode": "single"},
            }
            panel["fieldConfig"] = {
                "defaults": {
                    "color": {"mode": "thresholds"},
                    "custom": {"fillOpacity": 70},
                    "thresholds": {
                        "mode": "absolute",
                        "steps": [
                            {"color": "green", "value": None},
                            {"color": "red", "value": 1},
                        ],
                    },
                },
                "overrides": [],
            }

        elif panel_type == "candlestick":
            panel["type"] = "candlestick"
            panel["options"] = {
                "colors": {"down": "red", "flat": "gray", "up": "green"},
                "includeAllFields": False,
                "legend": {"displayMode": "list", "placement": "bottom"},
            }
            panel["fieldConfig"] = {
                "defaults": {
                    "color": {"mode": "palette-classic"},
                    "custom": {"axisCenteredZero": False, "axisPlacement": "auto"},
                },
                "overrides": [],
            }

        elif panel_type == "trend":
            panel["type"] = "trend"
            panel["options"] = {
                "legend": {"displayMode": "list", "placement": "bottom"},
                "tooltip": {"mode": "single"},
            }
            panel["fieldConfig"] = {
                "defaults": {
                    "color": {"mode": "palette-classic"},
                    "custom": {
                        "lineWidth": 2,
                        "fillOpacity": 10,
                        "pointSize": 5,
                    },
                },
                "overrides": [],
            }

        elif panel_type == "xy":
            panel["type"] = "xychart"
            panel["options"] = {
                "dims": {"x": None, "y": None},
                "legend": {"displayMode": "list", "placement": "bottom"},
                "series": [{"pointSize": {"fixed": 5}, "showPoints": "always"}],
                "tooltip": {"mode": "single"},
            }
            panel["fieldConfig"] = {
                "defaults": {"color": {"mode": "palette-classic"}},
                "overrides": [],
            }

        elif panel_type == "bar_gauge":
            panel["type"] = "bargauge"
            panel["options"] = {
                "displayMode": "gradient",
                "minVizHeight": 10,
                "minVizWidth": 0,
                "orientation": "horizontal",
                "reduceOptions": {
                    "calcs": ["lastNotNull"],
                    "fields": "",
                    "values": False,
                },
                "showUnfilled": True,
            }
            panel["fieldConfig"] = {
                "defaults": {
                    "color": {"mode": "thresholds"},
                    "thresholds": {
                        "mode": "absolute",
                        "steps": [
                            {"color": "green", "value": None},
                            {"color": "yellow", "value": 50},
                            {"color": "red", "value": 80},
                        ],
                    },
                },
                "overrides": [],
            }

        else:
            # Default to table
            panel["type"] = "table"
            panel["options"] = {"showHeader": True}

        return panel

    def generate_dashboard(
        self,
        plan: Dict[str, Any],
        title: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate a complete Grafana dashboard from an analytical plan.

        Args:
            plan: Analytical plan with viz specification
            title: Optional dashboard title override

        Returns:
            Grafana dashboard JSON
        """
        # Extract information from plan
        question = plan.get("q", plan.get("question", "Analytics Dashboard"))
        sql = plan.get("sql", "")
        viz = plan.get("viz", {})

        if not title:
            # If viz is a list, maybe take title from first panel or question?
            if isinstance(viz, list) and len(viz) > 0:
                 title = question[:50]
            elif isinstance(viz, dict):
                 title = viz.get("title", question[:50])
            else:
                 title = question[:50]

        # Handle multi-panel plans
        if isinstance(viz, list):
            # Propagate main SQL if panel SQL is missing
            enriched_panels = []
            for p in viz:
                p_copy = p.copy()
                if not p_copy.get("sql"):
                    p_copy["sql"] = sql
                enriched_panels.append(p_copy)
            return self.generate_multi_panel_dashboard(enriched_panels, title)

        # Generate dashboard (legacy single panel)
        dashboard: Dict[str, Any] = {
            "uid": generate_uid(),
            "title": title,
            "tags": ["auto-generated", "analytics"],
            "timezone": "browser",
            "schemaVersion": 38,
            "version": 1,
            "refresh": "5s",
            "time": {"from": "now-1h", "to": "now"},
            "panels": [],
        }

        # Add main panel
        if viz and sql:
            panel = self.generate_panel(
                viz,
                sql,
                {"x": 0, "y": 0, "w": 24, "h": 12},
            )
            dashboard["panels"].append(panel)

        return dashboard

    def generate_multi_panel_dashboard(
        self,
        panels: List[Dict[str, Any]],
        title: str = "Analytics Dashboard",
    ) -> Dict[str, Any]:
        """
        Generate a dashboard with multiple panels.

        Args:
            panels: List of panel specs, each with 'viz' and 'sql' keys
            title: Dashboard title

        Returns:
            Grafana dashboard JSON
        """
        dashboard: Dict[str, Any] = {
            "uid": generate_uid(),
            "title": title,
            "tags": ["auto-generated", "analytics", "overview"],
            "timezone": "browser",
            "schemaVersion": 38,
            "version": 1,
            "refresh": "30s",
            "time": {"from": "now-24h", "to": "now"},
            "panels": [],
        }

        # Layout panels in a grid (2 columns for most, full width for tables)
        y_pos = 0
        for i, panel_spec in enumerate(panels):
            viz = panel_spec.get("viz", panel_spec)
            sql = panel_spec.get("sql", "")
            panel_type = viz.get("type", "bar")

            # Determine grid position
            if panel_type in ["table", "line"]:
                # Full width
                grid_pos = {"x": 0, "y": y_pos, "w": 24, "h": 8}
                y_pos += 8
            else:
                # Half width, alternate left/right
                col = i % 2
                if col == 0 and i > 0:
                    pass  # y_pos already incremented
                grid_pos = {"x": col * 12, "y": y_pos, "w": 12, "h": 8}
                if col == 1:
                    y_pos += 8

            panel = self.generate_panel(viz, sql, grid_pos)
            dashboard["panels"].append(panel)

        return dashboard

    def generate_from_overview(self, overview: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate a dashboard from an overview specification.

        Args:
            overview: Overview specification with 'title' and 'panels'

        Returns:
            Grafana dashboard JSON
        """
        title = overview.get("title", "Data Overview")
        panels = overview.get("panels", [])

        return self.generate_multi_panel_dashboard(panels, title)
