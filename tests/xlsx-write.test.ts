import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { writeWorkbook } from "@/lib/xlsx/write";
import { readWorkbook } from "@/lib/xlsx/read";

/**
 * The export must round-trip through our own reader — that is the whole
 * point of the feature: download, edit in Excel, upload again.
 */
describe("xlsx writer", () => {
  test("what the writer writes, the reader reads back", () => {
    const rows = [
      ["Article Number", "Size", "Available"],
      ["HZ6891", "M", 53],
      ["HZ6891", "2XL", 0],
      ['Weird "quoted" & <named>', "One Size", 7],
    ];
    const buf = writeWorkbook("Stock", rows as (string | number)[][]);

    // A zip with the xlsx signature.
    assert.equal(buf.readUInt32LE(0), 0x04034b50);

    const wb = readWorkbook(buf, "export.xlsx");
    const sheet = wb.sheets[0];
    assert.equal(sheet.name, "Stock");
    assert.deepEqual(sheet.rows[0], ["Article Number", "Size", "Available"]);
    assert.deepEqual(sheet.rows[1], ["HZ6891", "M", "53"]);
    assert.deepEqual(sheet.rows[3], ['Weird "quoted" & <named>', "One Size", "7"]);
  });

  test("empty cells survive as empties, not shifted columns", () => {
    const buf = writeWorkbook("S", [["a", null, "c"]]);
    const wb = readWorkbook(buf, "e.xlsx");
    assert.equal(wb.sheets[0].rows[0][0], "a");
    assert.equal(wb.sheets[0].rows[0][2], "c");
  });
});
