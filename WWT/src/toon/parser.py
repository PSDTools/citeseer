"""TOON format parser - converts TOON strings to Python dicts."""

import re
from typing import Any


class ToonParseError(Exception):
    """Error parsing TOON format."""

    pass


def parse_toon(text: str) -> dict[str, Any]:
    """
    Parse TOON format string into a Python dictionary.

    TOON format:
    - @type{...} for typed objects
    - key:value for properties
    - [a,b,c] for arrays
    - "string" for strings with spaces
    - true/false for booleans
    - numbers without quotes

    Example:
        @plan{q:"What are delays?" feasible:true tables:[shipments]}
    """
    text = text.strip()

    # Handle top-level @type{...} wrapper
    type_match = re.match(r"@(\w+)\s*\{(.+)\}\s*$", text, re.DOTALL)
    if type_match:
        type_name = type_match.group(1)
        content = type_match.group(2)
        result = _parse_object_content(content)
        result["_type"] = type_name
        return result

    # Handle bare object {...}
    if text.startswith("{") and text.endswith("}"):
        return _parse_object_content(text[1:-1])

    # Handle single value
    return {"value": _parse_value(text)}


def _parse_object_content(content: str) -> dict[str, Any]:
    """Parse the content inside braces into a dictionary."""
    result = {}
    content = content.strip()

    i = 0
    while i < len(content):
        # Skip whitespace
        while i < len(content) and content[i] in " \t\n\r":
            i += 1

        if i >= len(content):
            break

        # Parse key
        key_match = re.match(r"(\w+)\s*:", content[i:])
        if not key_match:
            # Try to skip invalid character
            i += 1
            continue

        key = key_match.group(1)
        i += key_match.end()

        # Skip whitespace after colon
        while i < len(content) and content[i] in " \t\n\r":
            i += 1

        # Parse value
        value, consumed = _parse_value_at(content, i)
        result[key] = value
        i += consumed

        # Skip whitespace and optional comma
        while i < len(content) and content[i] in " \t\n\r,":
            i += 1

    return result


def _parse_value_at(text: str, start: int) -> tuple[Any, int]:
    """Parse a value starting at position, return (value, chars_consumed)."""
    i = start

    # Skip leading whitespace
    while i < len(text) and text[i] in " \t\n\r":
        i += 1

    if i >= len(text):
        return None, i - start

    char = text[i]

    # Nested @type{...}
    if char == "@":
        type_match = re.match(r"@(\w+)\s*\{", text[i:])
        if type_match:
            type_name = type_match.group(1)
            brace_start = i + type_match.end() - 1
            brace_end = _find_matching_brace(text, brace_start)
            inner_content = text[brace_start + 1 : brace_end]
            obj = _parse_object_content(inner_content)
            obj["_type"] = type_name
            return obj, brace_end + 1 - start

    # Object {...}
    if char == "{":
        brace_end = _find_matching_brace(text, i)
        inner_content = text[i + 1 : brace_end]
        return _parse_object_content(inner_content), brace_end + 1 - start

    # Array [...]
    if char == "[":
        bracket_end = _find_matching_bracket(text, i)
        inner_content = text[i + 1 : bracket_end]
        return _parse_array(inner_content), bracket_end + 1 - start

    # Quoted string
    if char == '"':
        end = _find_string_end(text, i)
        val = text[i + 1 : end].replace('\\"', '"').replace("\\\\", "\\")
        return val, end + 1 - start

    # Single-quoted string
    if char == "'":
        end = _find_string_end(text, i, quote="'")
        val = text[i + 1 : end].replace("\\'", "'").replace("\\\\", "\\")
        return val, end + 1 - start

    # Unquoted value (boolean, number, or identifier)
    value_match = re.match(r"([^\s,\}\]]+)", text[i:])
    if value_match:
        raw = value_match.group(1)
        return _parse_value(raw), len(raw)

    return None, 0


def _parse_value(raw: str) -> Any:
    """Parse a raw value string into appropriate Python type."""
    raw = raw.strip()

    if raw == "true":
        return True
    if raw == "false":
        return False
    if raw == "null" or raw == "none":
        return None

    # Try integer
    try:
        return int(raw)
    except ValueError:
        pass

    # Try float
    try:
        return float(raw)
    except ValueError:
        pass

    # Return as string
    return raw


def _parse_array(content: str) -> list[Any]:
    """Parse array content into a list."""
    result = []
    content = content.strip()

    if not content:
        return result

    i = 0
    while i < len(content):
        # Skip whitespace
        while i < len(content) and content[i] in " \t\n\r":
            i += 1

        if i >= len(content):
            break

        # Parse value
        value, consumed = _parse_value_at(content, i)
        if consumed > 0:
            result.append(value)
            i += consumed
        else:
            i += 1

        # Skip whitespace and comma
        while i < len(content) and content[i] in " \t\n\r,":
            i += 1

    return result


def _find_matching_brace(text: str, start: int) -> int:
    """Find the matching closing brace."""
    depth = 0
    i = start
    in_string = False
    string_char = None

    while i < len(text):
        char = text[i]

        if in_string:
            if char == "\\" and i + 1 < len(text):
                i += 2
                continue
            if char == string_char:
                in_string = False
        else:
            if char in "\"'":
                in_string = True
                string_char = char
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return i

        i += 1

    raise ToonParseError(f"Unmatched brace at position {start}")


def _find_matching_bracket(text: str, start: int) -> int:
    """Find the matching closing bracket."""
    depth = 0
    i = start
    in_string = False
    string_char = None

    while i < len(text):
        char = text[i]

        if in_string:
            if char == "\\" and i + 1 < len(text):
                i += 2
                continue
            if char == string_char:
                in_string = False
        else:
            if char in "\"'":
                in_string = True
                string_char = char
            elif char == "[":
                depth += 1
            elif char == "]":
                depth -= 1
                if depth == 0:
                    return i

        i += 1

    raise ToonParseError(f"Unmatched bracket at position {start}")


def _find_string_end(text: str, start: int, quote: str = '"') -> int:
    """Find the end of a quoted string."""
    i = start + 1

    while i < len(text):
        if text[i] == "\\" and i + 1 < len(text):
            i += 2
            continue
        if text[i] == quote:
            return i
        i += 1

    raise ToonParseError(f"Unterminated string at position {start}")
