/**
 * Buyer logo try-on — transform math and client-side persistence.
 *
 * The preview never leaves the browser. localStorage holds a downscaled data
 * URL plus the last x/y/scale/rotation so a buyer can walk the catalogue
 * without sending a trademark to the server. The real artwork is uploaded
 * only with the quote request.
 */

export const LOGO_STORAGE_KEY = "ph_buyer_logo";

export const MIN_SCALE = 0.06;
export const MAX_SCALE = 0.45;
export const MIN_COORD = 0.02;
export const MAX_COORD = 0.98;

/** Width as a fraction of the stage. Matches the existing default placement. */
export const DEFAULT_TRANSFORM = {
  x: 0.5,
  y: 0.42,
  scale: 0.18,
  rotation: 0,
} as const;

export interface LogoState {
  dataUrl: string;
  /** Centre of the logo, as fractions of the stage box. */
  x: number;
  y: number;
  /** Logo width as a fraction of stage width. Aspect ratio is always kept. */
  scale: number;
  /** Degrees clockwise. 0 is upright. */
  rotation: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function clampCoord(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return round4(Math.min(MAX_COORD, Math.max(MIN_COORD, n)));
}

export function clampScale(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TRANSFORM.scale;
  return round4(Math.min(MAX_SCALE, Math.max(MIN_SCALE, n)));
}

/** Fold any angle into [0, 360). */
export function normalizeRotation(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const folded = n % 360;
  const positive = folded < 0 ? folded + 360 : folded;
  return positive === 0 ? 0 : positive;
}

export function snapRotation(degrees: number, increment = 90): number {
  const step = increment > 0 ? increment : 90;
  return normalizeRotation(Math.round(normalizeRotation(degrees) / step) * step);
}

export function pointerDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** atan2, in degrees, of a pointer around a centre. */
export function pointerAngleDeg(cx: number, cy: number, px: number, py: number): number {
  return (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
}

export function scaleFromHandleDrag(
  startScale: number,
  startDistance: number,
  currentDistance: number,
): number {
  if (!(startDistance > 0) || !Number.isFinite(currentDistance)) {
    return clampScale(startScale);
  }
  return clampScale(startScale * (currentDistance / startDistance));
}

/** Smallest signed turn from one atan2 angle to another, in degrees. */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

export function rotationFromDrag(
  startRotation: number,
  startAngle: number,
  currentAngle: number,
  snap = false,
  snapIncrement = 15,
): number {
  const next = normalizeRotation(startRotation + shortestAngleDelta(startAngle, currentAngle));
  return snap ? snapRotation(next, snapIncrement) : next;
}

export function nudgeLogo(state: LogoState, dx: number, dy: number): LogoState {
  return {
    ...state,
    x: clampCoord(state.x + dx, state.x),
    y: clampCoord(state.y + dy, state.y),
  };
}

/**
 * Keyboard map for the overlay. Arrow keys nudge; [ ] rotate; - = scale.
 * Shift enlarges the step. Returns null when the key is not ours so the
 * caller can leave the event alone.
 */
export function applyLogoKey(
  state: LogoState,
  key: string,
  shift = false,
): LogoState | null {
  const pos = shift ? 0.05 : 0.01;
  const rot = shift ? 15 : 1;
  const zoom = shift ? 0.04 : 0.01;

  switch (key) {
    case "ArrowLeft":
      return nudgeLogo(state, -pos, 0);
    case "ArrowRight":
      return nudgeLogo(state, pos, 0);
    case "ArrowUp":
      return nudgeLogo(state, 0, -pos);
    case "ArrowDown":
      return nudgeLogo(state, 0, pos);
    case "[":
      return { ...state, rotation: normalizeRotation(state.rotation - rot) };
    case "]":
      return { ...state, rotation: normalizeRotation(state.rotation + rot) };
    case "-":
    case "_":
      return { ...state, scale: clampScale(state.scale - zoom) };
    case "=":
    case "+":
      return { ...state, scale: clampScale(state.scale + zoom) };
    default:
      return null;
  }
}

export function serializeLogoState(state: LogoState): string {
  return JSON.stringify({
    dataUrl: state.dataUrl,
    x: state.x,
    y: state.y,
    scale: state.scale,
    rotation: normalizeRotation(state.rotation),
  });
}

/**
 * Accept the current JSON payload and the previous "just a data URL" string
 * so an existing in-browser logo still appears after this change.
 */
export function parseStoredLogo(raw: string | null | undefined): LogoState | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:")) {
    return { dataUrl: trimmed, ...DEFAULT_TRANSFORM };
  }

  try {
    const parsed = JSON.parse(trimmed) as Partial<LogoState>;
    if (!parsed || typeof parsed.dataUrl !== "string" || !parsed.dataUrl.startsWith("data:")) {
      return null;
    }
    return {
      dataUrl: parsed.dataUrl,
      x: clampCoord(parsed.x, DEFAULT_TRANSFORM.x),
      y: clampCoord(parsed.y, DEFAULT_TRANSFORM.y),
      scale: clampScale(parsed.scale),
      rotation: normalizeRotation(parsed.rotation),
    };
  } catch {
    return null;
  }
}

export function readLogoState(storage: StorageLike): LogoState | null {
  try {
    return parseStoredLogo(storage.getItem(LOGO_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeLogoState(storage: StorageLike, state: LogoState | null): void {
  try {
    if (state) storage.setItem(LOGO_STORAGE_KEY, serializeLogoState(state));
    else storage.removeItem(LOGO_STORAGE_KEY);
  } catch {
    // Quota or private mode: the in-memory preview still works on this page.
  }
}

/* -------------------------------------------------------------------------
   Multi-logo / multi-view board
   ---------------------------------------------------------------------- */

export interface LogoAsset {
  id: string;
  dataUrl: string;
}

export interface ViewPlacement {
  id: string;
  viewUrl: string;
  logoId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface LogoBoard {
  logos: LogoAsset[];
  placements: ViewPlacement[];
}

export const EMPTY_BOARD: LogoBoard = { logos: [], placements: [] };

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function boardFromLegacy(state: LogoState | null): LogoBoard {
  if (!state) return { logos: [], placements: [] };
  const id = "legacy";
  return {
    logos: [{ id, dataUrl: state.dataUrl }],
    placements: [],
  };
}

export function parseStoredLogoBoard(raw: string | null | undefined): LogoBoard | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:")) {
    return boardFromLegacy(parseStoredLogo(trimmed));
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      v?: number;
      logos?: LogoAsset[];
      placements?: ViewPlacement[];
      dataUrl?: string;
    };
    if (!parsed || typeof parsed !== "object") return null;

    if (parsed.v === 2 && Array.isArray(parsed.logos)) {
      const logos = parsed.logos.filter(
        (l): l is LogoAsset =>
          !!l && typeof l.id === "string" && typeof l.dataUrl === "string" && l.dataUrl.startsWith("data:"),
      );
      const placements = (parsed.placements ?? [])
        .filter(
          (p): p is ViewPlacement =>
            !!p &&
            typeof p.id === "string" &&
            typeof p.viewUrl === "string" &&
            typeof p.logoId === "string",
        )
        .map((p) => ({
          ...p,
          x: clampCoord(p.x, DEFAULT_TRANSFORM.x),
          y: clampCoord(p.y, DEFAULT_TRANSFORM.y),
          scale: clampScale(p.scale),
          rotation: normalizeRotation(p.rotation),
        }));
      return { logos, placements };
    }

    const legacy = parseStoredLogo(trimmed);
    return legacy ? boardFromLegacy(legacy) : null;
  } catch {
    return null;
  }
}

export function serializeLogoBoard(board: LogoBoard): string {
  return JSON.stringify({
    v: 2,
    logos: board.logos,
    placements: board.placements,
  });
}

export function readLogoBoard(storage: StorageLike): LogoBoard {
  try {
    return parseStoredLogoBoard(storage.getItem(LOGO_STORAGE_KEY)) ?? EMPTY_BOARD;
  } catch {
    return EMPTY_BOARD;
  }
}

export function writeLogoBoard(storage: StorageLike, board: LogoBoard | null): void {
  try {
    if (board && (board.logos.length > 0 || board.placements.length > 0)) {
      storage.setItem(LOGO_STORAGE_KEY, serializeLogoBoard(board));
    } else {
      storage.removeItem(LOGO_STORAGE_KEY);
    }
  } catch {
    /* quota */
  }
}

export function addLogoToBoard(board: LogoBoard, dataUrl: string): LogoBoard {
  const id = newId();
  return { ...board, logos: [...board.logos, { id, dataUrl }] };
}

export function removeLogoFromBoard(board: LogoBoard, logoId: string): LogoBoard {
  return {
    logos: board.logos.filter((l) => l.id !== logoId),
    placements: board.placements.filter((p) => p.logoId !== logoId),
  };
}

export function placeLogoOnView(board: LogoBoard, viewUrl: string, logoId: string): LogoBoard {
  if (!board.logos.some((l) => l.id === logoId)) return board;
  const placement: ViewPlacement = {
    id: newId(),
    viewUrl,
    logoId,
    ...DEFAULT_TRANSFORM,
  };
  return { ...board, placements: [...board.placements, placement] };
}

export function updatePlacement(
  board: LogoBoard,
  placementId: string,
  patch: Partial<Pick<ViewPlacement, "x" | "y" | "scale" | "rotation">>,
): LogoBoard {
  return {
    ...board,
    placements: board.placements.map((p) =>
      p.id === placementId
        ? {
            ...p,
            ...patch,
            x: patch.x !== undefined ? clampCoord(patch.x, p.x) : p.x,
            y: patch.y !== undefined ? clampCoord(patch.y, p.y) : p.y,
            scale: patch.scale !== undefined ? clampScale(patch.scale) : p.scale,
            rotation: patch.rotation !== undefined ? normalizeRotation(patch.rotation) : p.rotation,
          }
        : p,
    ),
  };
}

export function removePlacement(board: LogoBoard, placementId: string): LogoBoard {
  return { ...board, placements: board.placements.filter((p) => p.id !== placementId) };
}
