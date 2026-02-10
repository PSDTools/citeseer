import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const SUPPORTED_EXTENSIONS = ['.csv', '.tsv', '.json', '.xlsx', '.xls', '.db', '.sqlite'];
const SQLITE_EXTENSIONS = ['.db', '.sqlite'];

export function isSupportedFile(filename: string): boolean {
	const lower = filename.toLowerCase();
	return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isSqliteFile(filename: string): boolean {
	const lower = filename.toLowerCase();
	return SQLITE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function deriveName(filename: string): string {
	const withoutExt = filename.replace(/\.(csv|tsv|json|xlsx|xls|db|sqlite)$/i, '');
	return withoutExt.replace(/[_-]/g, ' ');
}

export async function parseFile(
	file: File
): Promise<{ rows: Record<string, unknown>[]; derivedName: string }> {
	const name = file.name.toLowerCase();
	const derivedName = deriveName(file.name);

	if (name.endsWith('.csv')) {
		return { rows: await parseCsv(file), derivedName };
	}
	if (name.endsWith('.tsv')) {
		return { rows: await parseTsv(file), derivedName };
	}
	if (name.endsWith('.json')) {
		return { rows: await parseJson(file), derivedName };
	}
	if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
		return { rows: await parseExcel(file), derivedName };
	}

	throw new Error(`Unsupported file format: ${file.name}`);
}

async function parseCsv(file: File): Promise<Record<string, unknown>[]> {
	const text = await file.text();
	const result = Papa.parse(text, {
		header: true,
		skipEmptyLines: true,
		dynamicTyping: true
	});

	if (result.errors.length > 0) {
		throw new Error(`CSV parsing error: ${result.errors[0].message}`);
	}

	return result.data as Record<string, unknown>[];
}

async function parseTsv(file: File): Promise<Record<string, unknown>[]> {
	const text = await file.text();
	const result = Papa.parse(text, {
		header: true,
		skipEmptyLines: true,
		dynamicTyping: true,
		delimiter: '\t'
	});

	if (result.errors.length > 0) {
		throw new Error(`TSV parsing error: ${result.errors[0].message}`);
	}

	return result.data as Record<string, unknown>[];
}

async function parseJson(file: File): Promise<Record<string, unknown>[]> {
	const text = await file.text();
	let parsed: unknown;

	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error('Invalid JSON file');
	}

	if (Array.isArray(parsed)) {
		return parsed as Record<string, unknown>[];
	}

	if (parsed && typeof parsed === 'object' && 'data' in parsed && Array.isArray((parsed as { data: unknown }).data)) {
		return (parsed as { data: Record<string, unknown>[] }).data;
	}

	throw new Error('JSON must be an array of objects or an object with a "data" array');
}

async function parseExcel(file: File): Promise<Record<string, unknown>[]> {
	const buffer = await file.arrayBuffer();
	const workbook = XLSX.read(buffer, { cellDates: true });
	const firstSheetName = workbook.SheetNames[0];

	if (!firstSheetName) {
		throw new Error('Excel file has no sheets');
	}

	const sheet = workbook.Sheets[firstSheetName];
	const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

	return rows;
}
