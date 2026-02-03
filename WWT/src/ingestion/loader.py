"""Load CSV files into DuckDB."""

import os
from pathlib import Path
from typing import Dict, Generator, List, Optional, Union
from contextlib import contextmanager

import duckdb

# Default database path
DEFAULT_DB_PATH = os.getenv("DUCKDB_PATH", "./data/analytics.duckdb")


@contextmanager
def get_connection(db_path: Optional[str] = None) -> Generator[duckdb.DuckDBPyConnection, None, None]:
    """Get a DuckDB connection as a context manager."""
    path = db_path or DEFAULT_DB_PATH
    conn = duckdb.connect(path)
    try:
        yield conn
    finally:
        conn.close()


def load_csv_to_duckdb(
    csv_path: Union[str, Path],
    table_name: Optional[str] = None,
    db_path: Optional[str] = None,
    replace: bool = True,
) -> int:
    """
    Load a CSV file into DuckDB.

    Args:
        csv_path: Path to the CSV file
        table_name: Name for the table (defaults to filename without extension)
        db_path: Path to DuckDB database file
        replace: If True, replace existing table

    Returns:
        Number of rows loaded
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    if table_name is None:
        table_name = csv_path.stem

    with get_connection(db_path) as conn:
        if replace:
            conn.execute(f"DROP TABLE IF EXISTS {table_name}")

        # Use DuckDB's CSV reader with auto-detection
        conn.execute(f"""
            CREATE TABLE {table_name} AS
            SELECT * FROM read_csv_auto('{csv_path}', header=true, sample_size=-1)
        """)

        # Get row count
        result = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
        return result[0] if result else 0


def load_all_csvs(
    data_dir: Union[str, Path] = "./data",
    db_path: Optional[str] = None,
    pattern: str = "*.csv",
) -> Dict[str, int]:
    """
    Load all CSV files from a directory into DuckDB.

    Args:
        data_dir: Directory containing CSV files
        db_path: Path to DuckDB database file
        pattern: Glob pattern for CSV files

    Returns:
        Dictionary mapping table names to row counts
    """
    data_dir = Path(data_dir)
    results = {}

    for csv_file in data_dir.glob(pattern):
        table_name = csv_file.stem
        row_count = load_csv_to_duckdb(csv_file, table_name, db_path)
        results[table_name] = row_count

    return results


def get_tables(db_path: Optional[str] = None) -> List[str]:
    """Get list of tables in the database."""
    with get_connection(db_path) as conn:
        result = conn.execute("SHOW TABLES").fetchall()
        return [row[0] for row in result]


def get_table_schema(table_name: str, db_path: Optional[str] = None) -> List[dict]:
    """Get schema information for a table."""
    with get_connection(db_path) as conn:
        result = conn.execute(f"DESCRIBE {table_name}").fetchall()
        return [
            {
                "name": row[0],
                "type": row[1],
                "nullable": row[2] == "YES",
            }
            for row in result
        ]


def execute_query(sql: str, db_path: Optional[str] = None, params: Optional[dict] = None) -> List[dict]:
    """
    Execute a SQL query and return results as list of dicts.

    Args:
        sql: SQL query string
        db_path: Path to DuckDB database
        params: Optional query parameters

    Returns:
        List of row dictionaries
    """
    with get_connection(db_path) as conn:
        if params:
            result = conn.execute(sql, params)
        else:
            result = conn.execute(sql)

        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()

        return [dict(zip(columns, row)) for row in rows]


def export_to_sqlite(db_path: Optional[str] = None, sqlite_path: Optional[str] = None) -> str:
    """
    Export DuckDB tables to SQLite for Grafana compatibility.

    Args:
        db_path: Path to DuckDB database
        sqlite_path: Path for SQLite output (defaults to same directory with .sqlite extension)

    Returns:
        Path to the created SQLite file
    """
    import sqlite3

    db_path = db_path or DEFAULT_DB_PATH
    if sqlite_path is None:
        sqlite_path = db_path.replace(".duckdb", ".sqlite")

    # Get tables from DuckDB
    tables = get_tables(db_path)

    # Create/replace SQLite database
    if Path(sqlite_path).exists():
        Path(sqlite_path).unlink()

    sqlite_conn = sqlite3.connect(sqlite_path)

    with get_connection(db_path) as duck_conn:
        for table in tables:
            # Get data from DuckDB
            result = duck_conn.execute(f"SELECT * FROM {table}")
            columns = [desc[0] for desc in result.description]
            rows = result.fetchall()

            if not rows:
                continue

            # Create table in SQLite
            # Infer types from first row
            col_defs = []
            for i, col in enumerate(columns):
                val = rows[0][i]
                if isinstance(val, int):
                    col_defs.append(f'"{col}" INTEGER')
                elif isinstance(val, float):
                    col_defs.append(f'"{col}" REAL')
                else:
                    col_defs.append(f'"{col}" TEXT')

            create_sql = f"CREATE TABLE {table} ({', '.join(col_defs)})"
            sqlite_conn.execute(create_sql)

            # Insert data
            placeholders = ", ".join(["?"] * len(columns))
            insert_sql = f"INSERT INTO {table} VALUES ({placeholders})"
            sqlite_conn.executemany(insert_sql, rows)

    sqlite_conn.commit()
    sqlite_conn.close()

    return sqlite_path
