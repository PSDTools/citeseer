"""TOON format serializer - converts Python dicts to TOON strings."""

from typing import Any, Dict, List, Optional


def serialize_toon(data: Dict[str, Any], indent: int = 0, compact: bool = False) -> str:
    """
    Serialize a Python dictionary to TOON format string.

    Args:
        data: Dictionary to serialize
        indent: Current indentation level
        compact: If True, produce single-line output

    Returns:
        TOON format string
    """
    type_name = data.pop("_type", None) if isinstance(data, dict) else None

    if type_name:
        content = _serialize_object(data, indent, compact)
        if compact:
            return f"@{type_name}{{{content}}}"
        return f"@{type_name}{{\n{content}\n{' ' * indent}}}"

    if isinstance(data, dict):
        content = _serialize_object(data, indent, compact)
        if compact:
            return f"{{{content}}}"
        return f"{{\n{content}\n{' ' * indent}}}"

    return _serialize_value(data, indent, compact)


def _serialize_object(data: dict[str, Any], indent: int = 0, compact: bool = False) -> str:
    """Serialize object content (without braces)."""
    if not data:
        return ""

    parts = []
    inner_indent = indent + 2

    for key, value in data.items():
        if value is None:
            continue

        serialized = _serialize_value(value, inner_indent, compact)

        if compact:
            parts.append(f"{key}:{serialized}")
        else:
            parts.append(f"{' ' * inner_indent}{key}:{serialized}")

    if compact:
        return " ".join(parts)
    return "\n".join(parts)


def _serialize_value(value: Any, indent: int = 0, compact: bool = False) -> str:
    """Serialize a single value."""
    if value is None:
        return "null"

    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, (int, float)):
        return str(value)

    if isinstance(value, str):
        # Quote strings with spaces, special chars, or that look like keywords
        if (
            " " in value
            or "\n" in value
            or ":" in value
            or "{" in value
            or "}" in value
            or "[" in value
            or "]" in value
            or '"' in value
            or value in ("true", "false", "null")
            or not value
        ):
            # Escape quotes and backslashes
            escaped = value.replace("\\", "\\\\").replace('"', '\\"')
            return f'"{escaped}"'
        return value

    if isinstance(value, list):
        return _serialize_array(value, indent, compact)

    if isinstance(value, dict):
        type_name = value.get("_type")
        clean_data = {k: v for k, v in value.items() if k != "_type"}

        if type_name:
            content = _serialize_object(clean_data, indent, compact)
            if compact:
                return f"@{type_name}{{{content}}}"
            return f"@{type_name}{{\n{content}\n{' ' * indent}}}"
        else:
            content = _serialize_object(clean_data, indent, compact)
            if compact:
                return f"{{{content}}}"
            return f"{{\n{content}\n{' ' * indent}}}"

    # Fallback: convert to string
    return str(value)


def _serialize_array(arr: List[Any], indent: int = 0, compact: bool = False) -> str:
    """Serialize an array."""
    if not arr:
        return "[]"

    # Check if array contains complex objects
    has_complex = any(isinstance(item, (dict, list)) for item in arr)

    if compact or not has_complex:
        items = [_serialize_value(item, indent, compact=True) for item in arr]
        return "[" + ",".join(items) + "]"
    else:
        inner_indent = indent + 2
        items = [
            (" " * inner_indent) + _serialize_value(item, inner_indent, compact)
            for item in arr
        ]
        newline = "\n"
        indent_str = " " * indent
        return "[" + newline + ("," + newline).join(items) + newline + indent_str + "]"


def to_toon(obj: Any, type_name: Optional[str] = None, compact: bool = False) -> str:
    """
    Convert a Pydantic model or dict to TOON format.

    Args:
        obj: Object to convert (dict or Pydantic model)
        type_name: Optional type name to wrap the object
        compact: If True, produce single-line output

    Returns:
        TOON format string
    """
    # Convert Pydantic model to dict
    if hasattr(obj, "model_dump"):
        data = obj.model_dump(by_alias=True, exclude_none=True)
    elif hasattr(obj, "dict"):
        data = obj.dict(by_alias=True, exclude_none=True)
    else:
        data = dict(obj) if isinstance(obj, dict) else {"value": obj}

    if type_name:
        data["_type"] = type_name

    return serialize_toon(data, compact=compact)
