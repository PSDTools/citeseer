/**
 * TOON format parser - converts TOON strings to JavaScript objects.
 *
 * TOON (Text Object Oriented Notation) is a compact, LLM-optimized format:
 * - Objects: @type{key:value key2:value2}
 * - Arrays: [item1,item2,item3]
 * - Strings: Unquoted if simple, "quoted" if contains spaces/special chars
 * - Booleans: true/false
 * - Numbers: Unquoted integers/floats
 * - Nested: @outer{inner:@nested{...}}
 */

export class ToonParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ToonParseError';
	}
}

export function parseToon(text: string): Record<string, unknown> {
	text = text.trim();

	// Handle top-level @type{...} wrapper
	const typeMatch = text.match(/^@(\w+)\s*\{(.+)\}\s*$/s);
	if (typeMatch) {
		const typeName = typeMatch[1];
		const content = typeMatch[2];
		const result = parseObjectContent(content);
		result._type = typeName;
		return result;
	}

	// Handle bare object {...}
	if (text.startsWith('{') && text.endsWith('}')) {
		return parseObjectContent(text.slice(1, -1));
	}

	// Handle single value
	return { value: parseValue(text) };
}

function parseObjectContent(content: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	content = content.trim();

	let i = 0;
	while (i < content.length) {
		// Skip whitespace
		while (i < content.length && ' \t\n\r'.includes(content[i])) {
			i++;
		}

		if (i >= content.length) break;

		// Parse key
		const keyMatch = content.slice(i).match(/^(\w+)\s*:/);
		if (!keyMatch) {
			// Try to skip invalid character
			i++;
			continue;
		}

		const key = keyMatch[1];
		i += keyMatch[0].length;

		// Skip whitespace after colon
		while (i < content.length && ' \t\n\r'.includes(content[i])) {
			i++;
		}

		// Parse value
		const [value, consumed] = parseValueAt(content, i);
		result[key] = value;
		i += consumed;

		// Skip whitespace and optional comma
		while (i < content.length && ' \t\n\r,'.includes(content[i])) {
			i++;
		}
	}

	return result;
}

function parseValueAt(text: string, start: number): [unknown, number] {
	let i = start;

	// Skip leading whitespace
	while (i < text.length && ' \t\n\r'.includes(text[i])) {
		i++;
	}

	if (i >= text.length) {
		return [null, i - start];
	}

	const char = text[i];

	// Nested @type{...}
	if (char === '@') {
		const typeMatch = text.slice(i).match(/^@(\w+)\s*\{/);
		if (typeMatch) {
			const typeName = typeMatch[1];
			const braceStart = i + typeMatch[0].length - 1;
			const braceEnd = findMatchingBrace(text, braceStart);
			const innerContent = text.slice(braceStart + 1, braceEnd);
			const obj = parseObjectContent(innerContent);
			obj._type = typeName;
			return [obj, braceEnd + 1 - start];
		}
	}

	// Object {...}
	if (char === '{') {
		const braceEnd = findMatchingBrace(text, i);
		const innerContent = text.slice(i + 1, braceEnd);
		return [parseObjectContent(innerContent), braceEnd + 1 - start];
	}

	// Array [...]
	if (char === '[') {
		const bracketEnd = findMatchingBracket(text, i);
		const innerContent = text.slice(i + 1, bracketEnd);
		return [parseArray(innerContent), bracketEnd + 1 - start];
	}

	// Quoted string
	if (char === '"') {
		const end = findStringEnd(text, i);
		const val = text
			.slice(i + 1, end)
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, '\\');
		return [val, end + 1 - start];
	}

	// Single-quoted string
	if (char === "'") {
		const end = findStringEnd(text, i, "'");
		const val = text
			.slice(i + 1, end)
			.replace(/\\'/g, "'")
			.replace(/\\\\/g, '\\');
		return [val, end + 1 - start];
	}

	// Unquoted value (boolean, number, or identifier)
	const valueMatch = text.slice(i).match(/^([^\s,}\]]+)/);
	if (valueMatch) {
		const raw = valueMatch[1];
		return [parseValue(raw), raw.length];
	}

	return [null, 0];
}

function parseValue(raw: string): unknown {
	raw = raw.trim();

	if (raw === 'true') return true;
	if (raw === 'false') return false;
	if (raw === 'null' || raw === 'none') return null;

	// Try integer
	if (/^-?\d+$/.test(raw)) {
		return parseInt(raw, 10);
	}

	// Try float
	if (/^-?\d+\.\d+$/.test(raw)) {
		return parseFloat(raw);
	}

	// Return as string
	return raw;
}

function parseArray(content: string): unknown[] {
	const result: unknown[] = [];
	content = content.trim();

	if (!content) return result;

	let i = 0;
	while (i < content.length) {
		// Skip whitespace
		while (i < content.length && ' \t\n\r'.includes(content[i])) {
			i++;
		}

		if (i >= content.length) break;

		// Parse value
		const [value, consumed] = parseValueAt(content, i);
		if (consumed > 0) {
			result.push(value);
			i += consumed;
		} else {
			i++;
		}

		// Skip whitespace and comma
		while (i < content.length && ' \t\n\r,'.includes(content[i])) {
			i++;
		}
	}

	return result;
}

function findMatchingBrace(text: string, start: number): number {
	let depth = 0;
	let i = start;
	let inString = false;
	let stringChar = '';

	while (i < text.length) {
		const char = text[i];

		if (inString) {
			if (char === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (char === stringChar) {
				inString = false;
			}
		} else {
			if (char === '"' || char === "'") {
				inString = true;
				stringChar = char;
			} else if (char === '{') {
				depth++;
			} else if (char === '}') {
				depth--;
				if (depth === 0) {
					return i;
				}
			}
		}

		i++;
	}

	throw new ToonParseError(`Unmatched brace at position ${start}`);
}

function findMatchingBracket(text: string, start: number): number {
	let depth = 0;
	let i = start;
	let inString = false;
	let stringChar = '';

	while (i < text.length) {
		const char = text[i];

		if (inString) {
			if (char === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (char === stringChar) {
				inString = false;
			}
		} else {
			if (char === '"' || char === "'") {
				inString = true;
				stringChar = char;
			} else if (char === '[') {
				depth++;
			} else if (char === ']') {
				depth--;
				if (depth === 0) {
					return i;
				}
			}
		}

		i++;
	}

	throw new ToonParseError(`Unmatched bracket at position ${start}`);
}

function findStringEnd(text: string, start: number, quote: string = '"'): number {
	let i = start + 1;

	while (i < text.length) {
		if (text[i] === '\\' && i + 1 < text.length) {
			i += 2;
			continue;
		}
		if (text[i] === quote) {
			return i;
		}
		i++;
	}

	throw new ToonParseError(`Unterminated string at position ${start}`);
}

/**
 * Extract TOON from LLM response that might have markdown code blocks
 */
export function extractToon(response: string): string {
	// First, try to find @plan or @dashboard directly (highest priority)
	const toonMatch = response.match(/@(plan|dashboard)\s*\{[\s\S]*\}/);
	if (toonMatch) {
		return toonMatch[0];
	}

	// Try to find TOON in a specifically marked ```toon code block
	const toonBlockMatch = response.match(/```toon\s*\n?([\s\S]*?)\n?```/);
	if (toonBlockMatch) {
		return toonBlockMatch[1].trim();
	}

	// Return as-is
	return response.trim();
}
