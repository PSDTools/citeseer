"""Data profiler for detecting schema characteristics."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .loader import get_connection, get_tables, get_table_schema


@dataclass
class ColumnProfile:
    """Profile of a single column."""

    name: str
    dtype: str
    nullable: bool = True
    is_timestamp: bool = False
    is_metric: bool = False
    is_entity_id: bool = False
    is_categorical: bool = False
    distinct_count: int = 0
    sample_values: List[Any] = field(default_factory=list)
    min_value: Any = None
    max_value: Any = None


@dataclass
class TableProfile:
    """Profile of a table."""

    name: str
    row_count: int
    columns: List[ColumnProfile]

    def get_column(self, name: str) -> Optional[ColumnProfile]:
        """Get column profile by name."""
        for col in self.columns:
            if col.name == name:
                return col
        return None

    @property
    def timestamp_columns(self) -> List[str]:
        """Get names of timestamp columns."""
        return [c.name for c in self.columns if c.is_timestamp]

    @property
    def metric_columns(self) -> List[str]:
        """Get names of metric columns."""
        return [c.name for c in self.columns if c.is_metric]

    @property
    def entity_columns(self) -> List[str]:
        """Get names of entity ID columns."""
        return [c.name for c in self.columns if c.is_entity_id]

    @property
    def categorical_columns(self) -> List[str]:
        """Get names of categorical columns."""
        return [c.name for c in self.columns if c.is_categorical]


def _is_timestamp_type(dtype: str) -> bool:
    """Check if a DuckDB type is a timestamp type."""
    dtype_lower = dtype.lower()
    return any(t in dtype_lower for t in ["timestamp", "date", "time"])


def _is_numeric_type(dtype: str) -> bool:
    """Check if a DuckDB type is numeric."""
    dtype_lower = dtype.lower()
    return any(t in dtype_lower for t in [
        "integer", "bigint", "smallint", "tinyint",
        "double", "float", "real", "decimal", "numeric"
    ])


def _is_string_type(dtype: str) -> bool:
    """Check if a DuckDB type is string."""
    dtype_lower = dtype.lower()
    return any(t in dtype_lower for t in ["varchar", "char", "text", "string"])


def _looks_like_id(name: str) -> bool:
    """Check if column name looks like an ID field."""
    name_lower = name.lower()
    return (
        name_lower == "id"
        or name_lower.endswith("_id")
        or name_lower.endswith("id")
        or name_lower.startswith("id_")
    )


def _looks_like_timestamp(name: str) -> bool:
    """Check if column name looks like a timestamp."""
    name_lower = name.lower()
    return any(t in name_lower for t in [
        "date", "time", "timestamp", "created", "updated",
        "at", "when", "datetime"
    ])


def profile_column(
    table_name: str,
    column_name: str,
    dtype: str,
    nullable: bool,
    db_path: Optional[str] = None,
) -> ColumnProfile:
    """Profile a single column."""
    profile = ColumnProfile(
        name=column_name,
        dtype=dtype,
        nullable=nullable,
    )

    with get_connection(db_path) as conn:
        # Get distinct count
        result = conn.execute(
            f'SELECT COUNT(DISTINCT "{column_name}") FROM {table_name}'
        ).fetchone()
        profile.distinct_count = result[0] if result else 0

        # Get sample values
        result = conn.execute(
            f'SELECT DISTINCT "{column_name}" FROM {table_name} LIMIT 5'
        ).fetchall()
        profile.sample_values = [row[0] for row in result if row[0] is not None]

        # Get min/max for numeric or timestamp columns
        if _is_numeric_type(dtype) or _is_timestamp_type(dtype):
            result = conn.execute(
                f'SELECT MIN("{column_name}"), MAX("{column_name}") FROM {table_name}'
            ).fetchone()
            if result:
                profile.min_value = result[0]
                profile.max_value = result[1]

    # Determine column role
    if _is_timestamp_type(dtype) or _looks_like_timestamp(column_name):
        profile.is_timestamp = True

    elif _is_numeric_type(dtype):
        # Numeric columns that aren't IDs are likely metrics
        if not _looks_like_id(column_name):
            profile.is_metric = True

    elif _is_string_type(dtype):
        if _looks_like_id(column_name):
            profile.is_entity_id = True
        elif profile.distinct_count < 50:  # Low cardinality = categorical
            profile.is_categorical = True

    return profile


def profile_table(table_name: str, db_path: Optional[str] = None) -> TableProfile:
    """Profile a single table."""
    schema = get_table_schema(table_name, db_path)

    with get_connection(db_path) as conn:
        result = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
        row_count = result[0] if result else 0

    columns = []
    for col_info in schema:
        col_profile = profile_column(
            table_name,
            col_info["name"],
            col_info["type"],
            col_info["nullable"],
            db_path,
        )
        columns.append(col_profile)

    return TableProfile(name=table_name, row_count=row_count, columns=columns)


def profile_tables(db_path: Optional[str] = None) -> Dict[str, TableProfile]:
    """Profile all tables in the database."""
    tables = get_tables(db_path)
    return {name: profile_table(name, db_path) for name in tables}


@dataclass
class Relationship:
    """A detected relationship between tables."""
    
    source_table: str
    source_column: str
    target_table: str
    target_column: str
    type: str  # "fk" or "polymorphic"
    confidence: str = "high"


def detect_relationships(profiles: Dict[str, TableProfile]) -> List[Relationship]:
    """
    Detect relationships between tables based on naming conventions and data.
    
    Strategies:
    1. Standard FK: column "{table}_id" matches "{table}.id"
    2. Polymorphic: "entity_id" + "entity_type" pattern
    """
    relationships = []
    
    # 1. Standard Foreign Keys
    for source_name, source_profile in profiles.items():
        for col in source_profile.columns:
            if col.name.endswith("_id") and col.name != "id":
                # Check for table matching the prefix
                target_name = col.name[:-3]  # remove "_id"
                
                # Handle plurals simplistically (e.g. shipment_id -> shipments)
                potential_targets = [target_name, target_name + "s"]
                
                for target in potential_targets:
                    if target in profiles:
                        relationships.append(Relationship(
                            source_table=source_name,
                            source_column=col.name,
                            target_table=target,
                            target_column="id",
                            type="fk"
                        ))

    # 2. Polymorphic Relationships (entity_id + entity_type)
    for source_name, source_profile in profiles.items():
        entity_id_col = source_profile.get_column("entity_id")
        entity_type_col = source_profile.get_column("entity_type")
        
        if entity_id_col and entity_type_col and entity_type_col.sample_values:
            # Check values in entity_type to find targets
            # e.g. values like "shipment", "order"
            
            seen_types = set()
            for val in entity_type_col.sample_values:
                if isinstance(val, str) and val not in seen_types:
                    seen_types.add(val)
                    # Helper to find table: "shipment" -> "shipments", "order" -> "orders"
                    target_candidates = [val, val + "s"]
                    
                    for target in target_candidates:
                        if target in profiles:
                            relationships.append(Relationship(
                                source_table=source_name,
                                source_column="entity_id",
                                target_table=target,
                                target_column="id",
                                type="polymorphic",
                                confidence=f"high (via {entity_type_col.name}='{val}')"
                            ))

    return relationships


def generate_schema_context(profiles: Dict[str, TableProfile]) -> str:
    """
    Generate schema context string for LLM prompts.

    Returns a TOON-formatted schema description.
    """
    lines = ["@schemas{"]

    for table_name, profile in profiles.items():
        lines.append("  @table{")
        lines.append(f'    name:"{table_name}"')
        lines.append(f"    rows:{profile.row_count}")
        lines.append("    columns:[")

        for col in profile.columns:
            role = []
            if col.is_timestamp:
                role.append("timestamp")
            if col.is_metric:
                role.append("metric")
            if col.is_entity_id:
                role.append("entity_id")
            if col.is_categorical:
                role.append("categorical")

            role_str = ' role:[' + ",".join(role) + ']' if role else ""
            samples = ",".join(repr(v) for v in col.sample_values[:3])
            lines.append(
                f'      @col{{name:"{col.name}" type:{col.dtype}{role_str} samples:[{samples}]}}'
            )

        lines.append("    ]")

        # Add summary of useful columns
        if profile.timestamp_columns:
            lines.append('    timeColumns:[' + ",".join(profile.timestamp_columns) + ']')
        if profile.metric_columns:
            lines.append('    metricColumns:[' + ",".join(profile.metric_columns) + ']')
        if profile.categorical_columns:
            lines.append('    categoryColumns:[' + ",".join(profile.categorical_columns) + ']')

        lines.append("  }")

    # Add Relationships Section
    relationships = detect_relationships(profiles)
    if relationships:
        lines.append("  @relationships[")
        for rel in relationships:
            lines.append(
                f'    @rel{{from:"{rel.source_table}.{rel.source_column}" to:"{rel.target_table}.{rel.target_column}" type:{rel.type}}}'
            )
        lines.append("  ]")

    lines.append("}")

    return "\n".join(lines)
