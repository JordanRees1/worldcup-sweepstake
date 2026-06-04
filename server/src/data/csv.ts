import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

/**
 * Read a CSV file into an array of row objects keyed by header.
 * Handles BOMs and CRLF/LF line endings, and trims cell whitespace.
 */
export function readCsv<T extends Record<string, string>>(absPath: string): T[] {
  const text = readFileSync(absPath, 'utf8');
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as T[];
}
