import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  displayStyleName,
  displayStyleNameInText,
  storedStyleNamesForQuery,
} from "@/lib/domain/display-name";

describe("display style names", () => {
  test("expands the current adidas SAP titles conservatively", () => {
    assert.equal(displayStyleName("Perf Txt Polo"), "Performance Textured Polo");
    assert.equal(displayStyleName("Adi Perf Polo"), "Performance Polo");
    assert.equal(displayStyleName("Adi Perf H Polo"), "Performance H Polo");
    assert.equal(displayStyleName("Ult365 Sld Polo"), "Ultimate365 Solid Polo");
    assert.equal(displayStyleName("M Bu Driver Hd"), "Men's BU Driver Hoodie");
  });

  test("matches the shouting SAP form and extra whitespace", () => {
    assert.equal(displayStyleName("PERF TXT POLO"), "Performance Textured Polo");
    assert.equal(displayStyleName("  ult365   sld polo  "), "Ultimate365 Solid Polo");
  });

  test("does not invent colour names or rewrite unknown styles", () => {
    assert.equal(displayStyleName("Frotur"), "Frotur");
    assert.equal(displayStyleName("Dualin / Black"), "Dualin / Black");
    assert.equal(displayStyleName("Some Other Polo"), "Some Other Polo");
  });

  test("is idempotent once already expanded", () => {
    assert.equal(
      displayStyleName(displayStyleName("Perf Txt Polo")),
      "Performance Textured Polo",
    );
  });

  test("rewrites a stored title inside alt text without touching colour codes", () => {
    assert.equal(
      displayStyleNameInText("adidas Perf Txt Polo in Dualin / Black"),
      "adidas Performance Textured Polo in Dualin / Black",
    );
  });

  test("search by the public title still resolves the stored name", () => {
    assert.ok(storedStyleNamesForQuery("Performance Textured").includes("perf txt polo"));
    assert.ok(storedStyleNamesForQuery("Ultimate365").includes("ult365 sld polo"));
    assert.deepEqual(storedStyleNamesForQuery("Frotur"), []);
  });
});
