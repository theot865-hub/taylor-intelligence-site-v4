#!/usr/bin/env node
// Local conversion of an authenticated, private D1 JSON export. No network call.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CSV_COLUMNS = ["created_at", "name", "email", "marketing_consent", "source", "consent_version", "consent_text", "submission_id"];

export function exportRows(input) {
  if (!Array.isArray(input) || input.length !== 1 || input[0]?.success !== true || !Array.isArray(input[0].results)) {
    throw new Error("Expected one successful D1 SELECT result");
  }
  return input[0].results;
}

export function csvCell(value) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new Error("Invalid export cell");
  let text = String(value);
  // Keep formulas inert even when whitespace/control characters precede them.
  // JSON retains the original value; CSV adds a leading apostrophe for safety.
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvForRows(rows) {
  const lines = [CSV_COLUMNS.map(csvCell).join(",")];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)
        || ![0, 1].includes(row.marketing_consent)) throw new Error("Invalid lead row");
    lines.push(CSV_COLUMNS.map(column => csvCell(row[column])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export function writePrivateCSV(inputPath, outputPath) {
  if (resolve(inputPath) === resolve(outputPath)) throw new Error("Choose a different output path");
  const rows = exportRows(JSON.parse(readFileSync(inputPath, "utf8")));
  // Refuse to overwrite an existing file or follow an existing output symlink.
  writeFileSync(outputPath, csvForRows(rows), { encoding: "utf8", mode: 0o600, flag: "wx" });
  return rows.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) {
    console.error("Usage: node scripts/export-ai-intensive-leads.mjs private-d1.json private-leads.csv");
    process.exitCode = 1;
  } else {
    try { console.log(`Exported ${writePrivateCSV(process.argv[2], process.argv[3])} lead rows to a private CSV.`); }
    catch { console.error("Export failed. Check the private input, D1 result format and unused output path."); process.exitCode = 1; }
  }
}
