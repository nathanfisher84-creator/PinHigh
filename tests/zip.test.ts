import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readZip, isMeaningfulEntry, ZipError } from "@/lib/zip";
import { matchImageFilenames } from "@/lib/images/match";

/**
 * The zip reader is shared by the stock importer (.xlsx is a zip) and the bulk
 * image upload, so its edge cases are worth pinning down.
 *
 * The case that actually bit: PowerShell's Compress-Archive — which is what a
 * Windows owner reaches for when told to "zip that folder" — writes member
 * paths with backslashes rather than the forward slashes the spec calls for.
 * Before this was handled, every photo inside a sub-folder silently failed to
 * match and every macOS resource fork leaked into the "unmatched" list.
 */

/** Build a minimal stored (uncompressed) zip. CRCs are zero; nothing reads them. */
function buildZip(files: { name: string; content: string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.from(f.content, "utf8");

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt32LE(0, 14); // crc32
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10); // method: stored
    central.writeUInt32LE(0, 16); // crc32
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(offset, 42); // local header offset
    name.copy(central, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, cd, eocd]);
}

describe("zip reader", () => {
  test("reads stored members", () => {
    const zip = readZip(buildZip([{ name: "a.txt", content: "hello" }]));
    assert.equal(zip.get("a.txt")?.toString(), "hello");
  });

  test("backslash separators are normalised to forward slashes", () => {
    // Exactly what Compress-Archive produces on Windows.
    const zip = readZip(
      buildZip([{ name: "SS26 polos\\41001_1.jpg", content: "x" }]),
    );
    assert.ok(zip.has("SS26 polos/41001_1.jpg"), [...zip.keys()].join(", "));
  });

  test("a Windows-zipped pack still matches nested photos to articles", () => {
    // The end-to-end shape of the bug: before normalising, the filename was
    // taken as the whole "folder\file.jpg" string and matched nothing.
    const zip = readZip(
      buildZip([
        { name: "SS26 polos\\41001_1.jpg", content: "x" },
        { name: "__MACOSX\\41001_1.jpg", content: "junk" },
        { name: "Thumbs.db", content: "junk" },
      ]),
    );

    const meaningful = [...zip.keys()].filter(isMeaningfulEntry);
    assert.deepEqual(meaningful, ["SS26 polos/41001_1.jpg"]);

    const result = matchImageFilenames(
      meaningful.map((path) => ({ path })),
      ["41001"],
    );
    assert.equal(result.matched.length, 1);
    assert.equal(result.matched[0].article_number, "41001");
    assert.equal(result.matched[0].sequence, 1);
  });

  test("a file that is not a zip is refused with the caller's message", () => {
    assert.throws(
      () => readZip(Buffer.from("definitely not a zip"), "Custom message."),
      (err: unknown) => err instanceof ZipError && err.message === "Custom message.",
    );
  });

  test("an unreadable member is skipped rather than failing the whole archive", () => {
    // One corrupt photo must not cost the owner the other 200.
    const zip = buildZip([
      { name: "good.txt", content: "fine" },
      { name: "bad.txt", content: "x" },
    ]);
    // Flip the method to deflate in the *central directory* — that is the copy
    // the reader trusts. The stored bytes are not valid deflate data, so
    // inflating throws and the member should be dropped.
    const centralNameAt = zip.lastIndexOf(Buffer.from("bad.txt"));
    zip.writeUInt16LE(8, centralNameAt - 46 + 10);
    const read = readZip(zip);
    assert.equal(read.get("good.txt")?.toString(), "fine");
    assert.equal(read.has("bad.txt"), false);
  });
});
