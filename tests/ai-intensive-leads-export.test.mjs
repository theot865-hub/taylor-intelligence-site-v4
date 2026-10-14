import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CSV_COLUMNS, csvCell, csvForRows, exportRows, writePrivateCSV } from "../scripts/export-ai-intensive-leads.mjs";

function lead(overrides = {}) {
  return { created_at: "2026-10-14T23:00:00.000Z", name: 'Example, "Person"', email: "person@example.invalid", marketing_consent: 0, source: "/ai-intensive/", consent_version: "2026-10-14-v1", consent_text: "Send me one practical AI tip each week for my business", submission_id: "831fa0cb-9fbf-47a9-9a4f-784361d8700e", ...overrides };
}

test("CSV export neutralizes formulas including whitespace/control-prefixed formulas and quotes all cells", () => {
  for (const value of ['=HYPERLINK("https://evil.invalid")', "+1234", "-1+1", "@SUM(1)", "  =1+1", "\t=1+1", "\r@SUM(1)", "\ntext"]) {
    assert.match(csvCell(value), /^"'/, value);
  }
  assert.equal(csvCell('Example, "Person"'), '"Example, ""Person"""');
  assert.equal(csvCell("Safe Person"), '"Safe Person"');
  assert.throws(() => csvCell({}), /Invalid export cell/);
});

test("private JSON fields become a fixed-schema CSV while the original input is unchanged", () => {
  const row = lead({ name: "  =1+1", email: "+person@example.invalid" });
  const input = [{ success: true, results: [row] }];
  const before = JSON.stringify(input);
  const text = csvForRows(exportRows(input));
  assert.equal(text.split("\r\n")[0], CSV_COLUMNS.map(column => `"${column}"`).join(","));
  assert.equal(text.includes('"\'  =1+1"'), true);
  assert.equal(text.includes('"\'+person@example.invalid"'), true);
  assert.equal(JSON.stringify(input), before);
  assert.equal(csvForRows([]).split("\r\n").length, 2);
});

test("failed or unexpected D1 export structures and invalid consent rows cannot produce a CSV", () => {
  for (const value of [null, {}, [], [{ success: false, results: [] }], [{ success: true, results: {} }], [{ success: true, results: [] }, { success: true, results: [] }]]) {
    assert.throws(() => exportRows(value), /successful D1/);
  }
  assert.throws(() => csvForRows([lead({ marketing_consent: 2 })]), /Invalid lead row/);
  assert.throws(() => csvForRows([lead({ name: null })]), /Invalid export cell/);
});

test("export creates a mode-0600 file and refuses overwrite, input replacement and output symlinks", () => {
  const directory = mkdtempSync(join(tmpdir(), "ti-private-export-test-"));
  try {
    const input = join(directory, "leads.json");
    const output = join(directory, "leads.csv");
    writeFileSync(input, JSON.stringify([{ success: true, results: [lead()] }]), { mode: 0o600 });
    assert.equal(writePrivateCSV(input, output), 1);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.match(readFileSync(output, "utf8"), /Example, ""Person""/);
    assert.throws(() => writePrivateCSV(input, output), /EEXIST/);
    assert.throws(() => writePrivateCSV(input, input), /different output path/);
    const linked = join(directory, "linked.csv");
    symlinkSync(input, linked);
    assert.throws(() => writePrivateCSV(input, linked), /EEXIST/);
    assert.equal(JSON.parse(readFileSync(input, "utf8"))[0].results.length, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
