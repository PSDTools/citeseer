"""Query execution layer for validated analytical plans."""

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from ..ingestion.loader import get_connection
from ..compiler.validator import validate_sql_readonly, ValidationError


@dataclass
class QueryResult:
    """Result of a query execution."""

    success: bool
    data: List[Dict[str, Any]]
    columns: List[str]
    row_count: int
    error: Optional[str] = None


class QueryExecutor:
    """Execute validated SQL queries."""

    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize the query executor.

        Args:
            db_path: Path to DuckDB database
        """
        self.db_path = db_path

    def execute(self, sql: str, validate: bool = True) -> QueryResult:
        """
        Execute a SQL query and return results.

        Args:
            sql: SQL query to execute
            validate: Whether to validate SQL is read-only

        Returns:
            QueryResult with data and metadata
        """
        # Validate read-only
        if validate:
            try:
                validate_sql_readonly(sql)
            except ValidationError as e:
                return QueryResult(
                    success=False,
                    data=[],
                    columns=[],
                    row_count=0,
                    error=str(e),
                )

        try:
            with get_connection(self.db_path) as conn:
                result = conn.execute(sql)

                # Get column names
                columns = [desc[0] for desc in result.description]

                # Fetch all rows
                rows = result.fetchall()

                # Convert to list of dicts
                data = [dict(zip(columns, row)) for row in rows]

                return QueryResult(
                    success=True,
                    data=data,
                    columns=columns,
                    row_count=len(data),
                )

        except Exception as e:
            return QueryResult(
                success=False,
                data=[],
                columns=[],
                row_count=0,
                error=str(e),
            )

    def execute_plan(self, plan: Dict[str, Any]) -> QueryResult:
        """
        Execute the SQL from an analytical plan.

        Args:
            plan: Parsed analytical plan

        Returns:
            QueryResult with data and metadata
        """
        # Check if plan is feasible
        if not plan.get("feasible", True):
            return QueryResult(
                success=False,
                data=[],
                columns=[],
                row_count=0,
                error=plan.get("reason", "Query is not feasible"),
            )

        sql = plan.get("sql")
        if not sql:
            # Fallback: check if panels have SQL
            viz = plan.get("viz")
            if isinstance(viz, list) and len(viz) > 0 and viz[0].get("sql"):
                sql = viz[0].get("sql")
            elif isinstance(viz, dict) and viz.get("sql"):
                sql = viz.get("sql")
                
        if not sql:
            return QueryResult(
                success=False,
                data=[],
                columns=[],
                row_count=0,
                error="No SQL query in plan",
            )

        return self.execute(sql)

    def get_table_sample(self, table_name: str, limit: int = 10) -> QueryResult:
        """Get a sample of rows from a table."""
        # Sanitize table name (basic protection)
        if not re.match(r"^\w+$", table_name):
            return QueryResult(
                success=False,
                data=[],
                columns=[],
                row_count=0,
                error="Invalid table name",
            )

        sql = f"SELECT * FROM {table_name} LIMIT {limit}"
        return self.execute(sql, validate=False)

    def get_column_stats(self, table_name: str, column_name: str) -> QueryResult:
        """Get statistics for a column."""
        # Sanitize names
        if not re.match(r"^\w+$", table_name) or not re.match(r"^\w+$", column_name):
            return QueryResult(
                success=False,
                data=[],
                columns=[],
                row_count=0,
                error="Invalid table or column name",
            )

        sql = f"""
        SELECT
            COUNT(*) as total_count,
            COUNT(DISTINCT "{column_name}") as distinct_count,
            COUNT(*) - COUNT("{column_name}") as null_count
        FROM {table_name}
        """
        return self.execute(sql, validate=False)


class QueryLineage:
    """Track the lineage of queries from questions."""

    def __init__(self):
        self._history: List[Dict[str, Any]] = []

    def record(
        self,
        question: str,
        plan: Dict[str, Any],
        result: QueryResult,
    ) -> int:
        """
        Record a query execution in the lineage.

        Returns:
            Index of the recorded entry
        """
        entry = {
            "question": question,
            "plan": plan,
            "success": result.success,
            "row_count": result.row_count,
            "error": result.error,
        }
        self._history.append(entry)
        return len(self._history) - 1

    def get_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent query history."""
        return self._history[-limit:]

    def clear(self) -> None:
        """Clear the history."""
        self._history.clear()
