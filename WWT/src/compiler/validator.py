"""Validate LLM-generated analytical plans."""

import re
from typing import Any, Dict, List

from ..ingestion.profiler import TableProfile


class ValidationError(Exception):
    """Error validating an analytical plan."""

    pass


# SQL keywords that indicate write operations
WRITE_KEYWORDS = [
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "CREATE",
    "ALTER",
    "TRUNCATE",
    "REPLACE",
    "MERGE",
]


def validate_plan(
    plan: Dict[str, Any],
    table_profiles: Dict[str, TableProfile],
) -> None:
    """
    Validate an analytical plan against the available schema.

    Args:
        plan: The parsed analytical plan
        table_profiles: Available table profiles

    Raises:
        ValidationError: If validation fails
    """
    # Check if plan is marked as not feasible (that's valid)
    if not plan.get("feasible", True):
        return

    # Validate available tables
    tables = plan.get("tables", [])
    validate_table_references(tables, table_profiles)

    # Validate main SQL if present
    sql = plan.get("sql")
    if sql:
        validate_sql_readonly(sql)
        validate_column_references(sql, table_profiles)
    
    # Validate visualization spec
    viz = plan.get("viz")
    if viz:
        if isinstance(viz, list):
            for panel in viz:
                panel_sql = panel.get("sql") or sql
                if not panel_sql:
                     raise ValidationError(f"Panel '{panel.get('title')}' has no SQL and no main SQL is provided")
                
                # If panel has specific SQL, validate it
                if panel.get("sql"):
                    validate_sql_readonly(panel.get("sql"))
                    validate_column_references(panel.get("sql"), table_profiles)
                
                validate_visualization(panel, panel_sql)
        else:
             # Legacy single panel support
             if not sql:
                 raise ValidationError("Single panel viz requires main SQL")
             validate_visualization(viz, sql)


def validate_sql_readonly(sql: str) -> None:
    """Ensure SQL query is read-only."""
    sql_upper = sql.upper()

    for keyword in WRITE_KEYWORDS:
        # Check for keyword at word boundary
        pattern = r"\b" + keyword + r"\b"
        if re.search(pattern, sql_upper):
            raise ValidationError(
                f"SQL contains forbidden keyword: {keyword}. Only SELECT queries are allowed."
            )


def validate_table_references(
    tables: List[str],
    table_profiles: Dict[str, TableProfile],
) -> None:
    """Validate that referenced tables exist."""
    available_tables = set(table_profiles.keys())

    for table in tables:
        if table not in available_tables:
            raise ValidationError(
                f"Table '{table}' not found. Available tables: {', '.join(available_tables)}"
            )


def validate_column_references(
    sql: str,
    table_profiles: Dict[str, TableProfile],
) -> None:
    """
    Validate that column references in SQL exist in the schema.

    This is a basic check - it looks for column names mentioned in the SQL
    and verifies they exist in at least one table.
    """
    # Collect all column names from all tables
    all_columns = set()
    for profile in table_profiles.values():
        for col in profile.columns:
            all_columns.add(col.name.lower())

    # Add common SQL functions/keywords that aren't columns
    sql_keywords = {
        "select", "from", "where", "group", "by", "order", "having",
        "and", "or", "not", "in", "is", "null", "as", "on", "join",
        "left", "right", "inner", "outer", "full", "cross", "limit",
        "offset", "asc", "desc", "distinct", "count", "sum", "avg",
        "min", "max", "case", "when", "then", "else", "end", "like",
        "between", "exists", "union", "all", "any", "true", "false",
        "coalesce", "cast", "extract", "date", "time", "timestamp",
        "year", "month", "day", "hour", "minute", "second", "interval",
    }

    # Extract potential column references (words that aren't in quotes)
    # This is a simplified approach
    sql_clean = re.sub(r"'[^']*'", "", sql)  # Remove string literals
    sql_clean = re.sub(r'"[^"]*"', "", sql_clean)  # Remove quoted identifiers
    words = re.findall(r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b", sql_clean)

    unknown_refs = []
    for word in words:
        word_lower = word.lower()
        # Skip SQL keywords, numbers, and known columns
        if word_lower in sql_keywords:
            continue
        if word_lower in all_columns:
            continue
        # Skip table names
        if word_lower in {t.lower() for t in table_profiles.keys()}:
            continue
        # Skip common aliases
        if len(word) <= 2:  # Common aliases like t, s, e
            continue

        unknown_refs.append(word)

    # Only raise error if we have definite unknown references
    # This check is intentionally lenient to avoid false positives
    if unknown_refs and len(unknown_refs) > 3:
        raise ValidationError(
            f"SQL may reference unknown columns: {', '.join(unknown_refs[:5])}"
        )


def validate_visualization(viz: Dict[str, Any], sql: str) -> None:
    """Validate visualization specification matches SQL output."""
    viz_type = viz.get("type", "").lower()

    valid_types = {"bar", "line", "stat", "table", "pie", "gauge"}
    if viz_type and viz_type not in valid_types:
        raise ValidationError(
            f"Invalid visualization type: {viz_type}. Valid types: {', '.join(valid_types)}"
        )

    # For bar/line charts, x and y should be present
    if viz_type in {"bar", "line", "pie"}:
        if not viz.get("x") and not viz.get("y"):
            raise ValidationError(
                f"{viz_type} chart requires x and/or y axis column specifications"
            )

    # For stat type, value should be present
    if viz_type == "stat" and not viz.get("value"):
        # This is a soft warning - stat can work without explicit value
        pass


def extract_columns_from_sql(sql: str) -> List[str]:
    """
    Extract column names from SELECT clause.

    This is a basic extraction - handles simple cases like:
    - SELECT col1, col2 FROM ...
    - SELECT col1 AS alias, COUNT(*) as cnt FROM ...
    """
    # Find SELECT clause
    select_match = re.search(r"SELECT\s+(.*?)\s+FROM", sql, re.IGNORECASE | re.DOTALL)
    if not select_match:
        return []

    select_clause = select_match.group(1)

    # Split by comma (handling nested parentheses)
    columns = []
    depth = 0
    current = ""

    for char in select_clause:
        if char == "(":
            depth += 1
            current += char
        elif char == ")":
            depth -= 1
            current += char
        elif char == "," and depth == 0:
            columns.append(current.strip())
            current = ""
        else:
            current += char

    if current.strip():
        columns.append(current.strip())

    # Extract column names/aliases
    result = []
    for col in columns:
        col = col.strip()
        # Handle "col AS alias" or "col alias"
        as_match = re.search(r"\bAS\s+(\w+)\s*$", col, re.IGNORECASE)
        if as_match:
            result.append(as_match.group(1))
        else:
            # Handle simple column or "col alias" without AS
            parts = col.split()
            if len(parts) >= 2 and not parts[-1].upper().startswith(("(", ")")):
                result.append(parts[-1])
            else:
                # Extract the column name itself
                col_match = re.match(r"(\w+)", col)
                if col_match:
                    result.append(col_match.group(1))

    return result
