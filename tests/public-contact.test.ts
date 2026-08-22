import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isUnpublishedContactNumber,
  publicContactNumber,
  telHref,
} from "@/lib/domain/public-contact";

describe("public contact numbers", () => {
  test("hides empty values and the seeded placeholders", () => {
    for (const raw of [
      "",
      "   ",
      "+971 4 000 0000",
      "+971500000000",
      "tel:+",
      "+",
      "0000000",
    ]) {
      assert.equal(publicContactNumber(raw), null, raw);
      assert.equal(isUnpublishedContactNumber(raw), true, raw);
    }
  });

  test("does not invent a replacement — a real number is passed through", () => {
    assert.equal(publicContactNumber("+971 4 555 1234"), "+971 4 555 1234");
    assert.equal(telHref("+971 4 555 1234"), "tel:+97145551234");
  });

  test("the old footer strip produced tel:+ — that href is refused", () => {
    // contactPhone.replace(/[^+d]/g, "") on "+971 4 000 0000" left only "+".
    assert.equal(telHref("+"), null);
    assert.equal(telHref(""), null);
  });
});
