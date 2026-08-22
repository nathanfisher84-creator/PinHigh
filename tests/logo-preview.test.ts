import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TRANSFORM,
  LOGO_STORAGE_KEY,
  MAX_SCALE,
  MIN_SCALE,
  applyLogoKey,
  clampScale,
  normalizeRotation,
  nudgeLogo,
  parseStoredLogo,
  pointerAngleDeg,
  pointerDistance,
  readLogoState,
  rotationFromDrag,
  scaleFromHandleDrag,
  serializeLogoState,
  snapRotation,
  writeLogoState,
  type LogoState,
} from "@/lib/logo-preview";

const SAMPLE: LogoState = {
  dataUrl: "data:image/png;base64,aaa",
  x: 0.4,
  y: 0.35,
  scale: 0.2,
  rotation: 15,
};

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    map,
  };
}

describe("parseStoredLogo", () => {
  test("reads the legacy data-URL string and applies the default transform", () => {
    const parsed = parseStoredLogo("data:image/png;base64,abc");
    assert.deepEqual(parsed, { dataUrl: "data:image/png;base64,abc", ...DEFAULT_TRANSFORM });
  });

  test("reads JSON with x, y, scale and rotation", () => {
    const parsed = parseStoredLogo(serializeLogoState(SAMPLE));
    assert.deepEqual(parsed, SAMPLE);
  });

  test("fills missing rotation on a partial JSON payload", () => {
    const parsed = parseStoredLogo(
      JSON.stringify({ dataUrl: "data:image/png;base64,abc", x: 0.3, y: 0.3, scale: 0.1 }),
    );
    assert.equal(parsed?.rotation, 0);
    assert.equal(parsed?.x, 0.3);
    assert.equal(parsed?.scale, 0.1);
  });

  test("rejects junk and empty values", () => {
    assert.equal(parseStoredLogo(null), null);
    assert.equal(parseStoredLogo(""), null);
    assert.equal(parseStoredLogo("{not-json"), null);
    assert.equal(parseStoredLogo(JSON.stringify({ x: 0.5 })), null);
    assert.equal(parseStoredLogo(JSON.stringify({ dataUrl: "https://evil.example/logo.png" })), null);
  });

  test("clamps out-of-range numbers", () => {
    const parsed = parseStoredLogo(
      JSON.stringify({
        dataUrl: "data:image/png;base64,abc",
        x: 4,
        y: -1,
        scale: 9,
        rotation: 370,
      }),
    );
    assert.equal(parsed?.x, 0.98);
    assert.equal(parsed?.y, 0.02);
    assert.equal(parsed?.scale, MAX_SCALE);
    assert.equal(parsed?.rotation, 10);
  });
});

describe("localStorage logo state", () => {
  test("write then read restores the full transform", () => {
    const storage = memoryStorage();
    writeLogoState(storage, SAMPLE);
    assert.deepEqual(readLogoState(storage), SAMPLE);
    assert.ok(storage.map.get(LOGO_STORAGE_KEY)?.startsWith("{"));
  });

  test("still reads a logo stored as a bare data URL", () => {
    const storage = memoryStorage({ [LOGO_STORAGE_KEY]: "data:image/svg+xml;base64,abc" });
    const read = readLogoState(storage);
    assert.equal(read?.dataUrl, "data:image/svg+xml;base64,abc");
    assert.equal(read?.rotation, 0);
    assert.equal(read?.scale, DEFAULT_TRANSFORM.scale);
  });

  test("clearing writes a removal, not a network payload", () => {
    const storage = memoryStorage();
    writeLogoState(storage, SAMPLE);
    writeLogoState(storage, null);
    assert.equal(storage.map.has(LOGO_STORAGE_KEY), false);
    assert.equal(readLogoState(storage), null);
  });
});

describe("transform math", () => {
  test("nudge stays inside the stage", () => {
    const moved = nudgeLogo(SAMPLE, 0.7, -0.5);
    assert.equal(moved.x, 0.98);
    assert.equal(moved.y, 0.02);
    assert.equal(moved.scale, SAMPLE.scale);
    assert.equal(moved.rotation, SAMPLE.rotation);
  });

  test("scale-from-handle keeps aspect by changing only scale", () => {
    assert.equal(scaleFromHandleDrag(0.2, 100, 150), 0.3);
    assert.equal(scaleFromHandleDrag(0.2, 100, 10), MIN_SCALE);
    assert.equal(scaleFromHandleDrag(0.2, 0, 80), clampScale(0.2));
  });

  test("rotation follows the pointer and can snap to 0/90", () => {
    assert.equal(rotationFromDrag(0, 0, 40), 40);
    assert.equal(rotationFromDrag(10, 0, -20), 350);
    assert.equal(rotationFromDrag(0, 170, -170), 20);
    assert.equal(rotationFromDrag(0, 0, 88, true, 90), 90);
    assert.equal(snapRotation(7, 90), 0);
    assert.equal(snapRotation(50, 90), 90);
  });

  test("pointer helpers match the geometry the handles use", () => {
    assert.equal(pointerDistance(0, 0, 3, 4), 5);
    assert.equal(pointerAngleDeg(0, 0, 1, 0), 0);
    assert.equal(pointerAngleDeg(0, 0, 0, 1), 90);
    assert.equal(normalizeRotation(-90), 270);
  });
});

describe("keyboard map", () => {
  test("arrows nudge and shift takes a larger step", () => {
    assert.equal(applyLogoKey(SAMPLE, "ArrowRight")?.x, 0.41);
    assert.equal(applyLogoKey(SAMPLE, "ArrowRight", true)?.x, 0.45);
    assert.equal(applyLogoKey(SAMPLE, "ArrowUp")?.y, 0.34);
  });

  test("brackets rotate and minus/plus resize", () => {
    assert.equal(applyLogoKey(SAMPLE, "]")?.rotation, 16);
    assert.equal(applyLogoKey(SAMPLE, "[", true)?.rotation, 0);
    assert.equal(applyLogoKey(SAMPLE, "=")?.scale, 0.21);
    assert.equal(applyLogoKey(SAMPLE, "-", true)?.scale, 0.16);
  });

  test("unknown keys are ignored", () => {
    assert.equal(applyLogoKey(SAMPLE, "Escape"), null);
    assert.equal(applyLogoKey(SAMPLE, "a"), null);
  });
});
