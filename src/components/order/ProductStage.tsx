"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProductImage } from "@/components/catalogue/ProductImage";
import {
  addLogoToBoard,
  applyLogoKey,
  clampCoord,
  EMPTY_BOARD,
  placeLogoOnView,
  pointerAngleDeg,
  pointerDistance,
  readLogoBoard,
  removeLogoFromBoard,
  removePlacement,
  rotationFromDrag,
  scaleFromHandleDrag,
  updatePlacement,
  writeLogoBoard,
  type LogoBoard,
  type ViewPlacement,
} from "@/lib/logo-preview";

/**
 * Product stage: every angle shown together, with logos placed independently
 * on more than one view (chest and back in one go, not a single overlay).
 *
 * Preview stays in the browser. Real artwork is uploaded with the quote.
 */

const MAX_LOGO_BYTES = 4 * 1024 * 1024;
const MAX_LOGO_EDGE = 600;

const RESIZE_HANDLES = [
  { id: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize", label: "Resize logo from top left" },
  { id: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize", label: "Resize logo from top right" },
  { id: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize", label: "Resize logo from bottom left" },
  { id: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize", label: "Resize logo from bottom right" },
] as const;

interface StageImage {
  url: string;
  alt: string | null;
}

interface Props {
  images: StageImage[];
  articleNumber: string;
  styleName: string;
  colour: string;
  badge?: React.ReactNode;
}

type Gesture =
  | { type: "move"; pointerId: number; placementId: string; dx: number; dy: number }
  | { type: "resize"; pointerId: number; placementId: string; startScale: number; startDist: number }
  | { type: "rotate"; pointerId: number; placementId: string; startRotation: number; startAngle: number };

async function fileToDataUrl(file: File): Promise<string> {
  if (file.type === "image/svg+xml") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    });
  }

  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_LOGO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function persist(board: LogoBoard) {
  if (typeof window === "undefined") return;
  writeLogoBoard(window.localStorage, board);
}

export function ProductStage({ images, articleNumber, styleName, colour, badge }: Props) {
  const [board, setBoard] = useState<LogoBoard>(EMPTY_BOARD);
  const [selectedLogoId, setSelectedLogoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const boardRef = useRef(board);
  const readyRef = useRef(false);
  boardRef.current = board;
  readyRef.current = ready;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readLogoBoard(window.localStorage);
    setBoard(stored);
    setSelectedLogoId(stored.logos[0]?.id ?? null);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    persist(board);
  }, [board, ready]);

  useEffect(() => {
    return () => {
      if (readyRef.current) persist(boardRef.current);
    };
  }, []);

  const onUpload = async (file: File | undefined | null) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setError("That file is over 4 MB — export a smaller version for the preview.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setBoard((current) => {
        const next = addLogoToBoard(current, dataUrl);
        setSelectedLogoId(next.logos[next.logos.length - 1]?.id ?? null);
        return next;
      });
    } catch {
      setError("That file couldn't be read as an image. PNG with transparency works best.");
    }
  };

  const views = images.length > 0 ? images : [{ url: "", alt: null }];
  const showGrid = views.length > 1;

  return (
    <div>
      <div className={showGrid ? "grid gap-3 sm:grid-cols-2" : ""}>
        {views.map((img, i) => (
          <ViewCanvas
            key={img.url || `empty-${i}`}
            image={img}
            articleNumber={articleNumber}
            styleName={styleName}
            colour={colour}
            badge={i === 0 ? badge : undefined}
            board={board}
            setBoard={setBoard}
            selectedLogoId={selectedLogoId}
            label={img.alt ?? `View ${i + 1}`}
          />
        ))}
      </div>

      <div className="mt-3 hairline bg-paper-raised px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex min-h-11 cursor-pointer items-center font-medium underline underline-offset-2 hover:text-fairway">
            {board.logos.length ? "Add another logo" : "See your logo on this"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={(e) => onUpload(e.target.files?.[0])}
            />
          </label>
          <span className="text-xs text-graphite-ink">
            Place a mark on the chest and another on the back — every view stays on screen.
          </span>
        </div>

        {board.logos.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {board.logos.map((logo, i) => (
              <li key={logo.id}>
                <button
                  type="button"
                  onClick={() => setSelectedLogoId(logo.id)}
                  aria-pressed={selectedLogoId === logo.id}
                  className={[
                    "flex items-center gap-2 border px-2 py-1 text-xs",
                    selectedLogoId === logo.id ? "border-ink" : "border-sand hover:border-graphite",
                  ].join(" ")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo.dataUrl} alt="" className="h-6 w-6 object-contain" />
                  Logo {i + 1}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBoard((b) => removeLogoFromBoard(b, logo.id));
                    setSelectedLogoId((id) => (id === logo.id ? null : id));
                  }}
                  className="ml-1 text-xs text-graphite-ink underline underline-offset-2 hover:text-flag-ink"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="mt-1.5 text-xs text-flag-ink" role="alert">
            {error}
          </p>
        )}
        {board.logos.length > 0 && (
          <p className="mt-1.5 text-xs text-graphite-ink">
            Select a logo, then “Place on this view” under a photograph. Drag, resize and rotate
            each mark on its own view. Visual mock-up only — we confirm application with your quote.
          </p>
        )}
      </div>
    </div>
  );
}

function ViewCanvas({
  image,
  articleNumber,
  styleName,
  colour,
  badge,
  board,
  setBoard,
  selectedLogoId,
  label,
}: {
  image: StageImage;
  articleNumber: string;
  styleName: string;
  colour: string;
  badge?: React.ReactNode;
  board: LogoBoard;
  setBoard: React.Dispatch<React.SetStateAction<LogoBoard>>;
  selectedLogoId: string | null;
  label: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;

  const placements = board.placements.filter((p) => p.viewUrl === image.url);

  const applyGesture = useCallback((e: PointerEvent) => {
    const gesture = gestureRef.current;
    const box = stageRef.current?.getBoundingClientRect();
    if (!gesture || gesture.pointerId !== e.pointerId || !box) return;
    const current = boardRef.current.placements.find((p) => p.id === gesture.placementId);
    if (!current) return;

    if (gesture.type === "move") {
      const x = (e.clientX - box.left) / box.width - gesture.dx;
      const y = (e.clientY - box.top) / box.height - gesture.dy;
      setBoard((b) =>
        updatePlacement(b, gesture.placementId, {
          x: clampCoord(x, current.x),
          y: clampCoord(y, current.y),
        }),
      );
      return;
    }

    const cx = box.left + current.x * box.width;
    const cy = box.top + current.y * box.height;

    if (gesture.type === "resize") {
      const dist = pointerDistance(cx, cy, e.clientX, e.clientY);
      setBoard((b) =>
        updatePlacement(b, gesture.placementId, {
          scale: scaleFromHandleDrag(gesture.startScale, gesture.startDist, dist),
        }),
      );
      return;
    }

    const angle = pointerAngleDeg(cx, cy, e.clientX, e.clientY);
    setBoard((b) =>
      updatePlacement(b, gesture.placementId, {
        rotation: rotationFromDrag(gesture.startRotation, gesture.startAngle, angle, e.shiftKey),
      }),
    );
  }, [setBoard]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => applyGesture(e);
    const onUp = (e: PointerEvent) => {
      if (gestureRef.current?.pointerId !== e.pointerId) return;
      gestureRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyGesture]);

  const centreOf = (placement: ViewPlacement) => {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      box,
      cx: box.left + placement.x * box.width,
      cy: box.top + placement.y * box.height,
    };
  };

  return (
    <div>
      <div
        ref={stageRef}
        className="relative aspect-[4/5] bg-paper-sunken hairline overflow-hidden"
      >
        {image.url ? (
          <Image
            src={image.url}
            alt={image.alt ?? `${styleName} in ${colour}`}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover select-none"
            draggable={false}
          />
        ) : (
          <ProductImage
            src={null}
            alt={`${styleName} in ${colour}`}
            articleNumber={articleNumber}
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        )}

        {badge && <span className="absolute right-0 top-0 z-10">{badge}</span>}

        {placements.map((placement) => {
          const logo = board.logos.find((l) => l.id === placement.logoId);
          if (!logo) return null;
          return (
            <div
              key={placement.id}
              className="absolute z-20 touch-none"
              style={{
                left: `${placement.x * 100}%`,
                top: `${placement.y * 100}%`,
                width: `${placement.scale * 100}%`,
                transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
              }}
            >
              <button
                type="button"
                aria-label="Your logo — drag or use arrow keys to position it."
                onPointerDown={(e) => {
                  const box = stageRef.current?.getBoundingClientRect();
                  if (!box) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  gestureRef.current = {
                    type: "move",
                    pointerId: e.pointerId,
                    placementId: placement.id,
                    dx: (e.clientX - box.left) / box.width - placement.x,
                    dy: (e.clientY - box.top) / box.height - placement.y,
                  };
                }}
                onKeyDown={(e) => {
                  const asState = {
                    dataUrl: logo.dataUrl,
                    x: placement.x,
                    y: placement.y,
                    scale: placement.scale,
                    rotation: placement.rotation,
                  };
                  const next = applyLogoKey(asState, e.key, e.shiftKey);
                  if (!next) return;
                  e.preventDefault();
                  setBoard((b) =>
                    updatePlacement(b, placement.id, {
                      x: next.x,
                      y: next.y,
                      scale: next.scale,
                      rotation: next.rotation,
                    }),
                  );
                }}
                className="relative block w-full cursor-grab bg-transparent p-0 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-fairway"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo.dataUrl}
                  alt=""
                  draggable={false}
                  className="pointer-events-none h-auto w-full select-none drop-shadow-[0_1px_2px_rgba(20,24,26,0.25)]"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 border border-ink/70"
                />
              </button>

              {RESIZE_HANDLES.map((handle) => (
                <button
                  key={handle.id}
                  type="button"
                  aria-label={handle.label}
                  onPointerDown={(e) => {
                    const centre = centreOf(placement);
                    if (!centre) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    gestureRef.current = {
                      type: "resize",
                      pointerId: e.pointerId,
                      placementId: placement.id,
                      startScale: placement.scale,
                      startDist: pointerDistance(centre.cx, centre.cy, e.clientX, e.clientY),
                    };
                  }}
                  className={`absolute z-30 flex h-11 w-11 items-center justify-center ${handle.className}`}
                  style={{ cursor: handle.cursor }}
                >
                  <span
                    aria-hidden="true"
                    className="block h-2.5 w-2.5 border border-ink bg-paper-raised shadow-[0_0_0_1px_rgba(250,250,248,0.85)]"
                  />
                </button>
              ))}

              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-0 z-20 h-5 w-px -translate-x-1/2 -translate-y-full bg-ink/70"
              />
              <button
                type="button"
                aria-label="Rotate logo. Hold Shift to snap to 15 degrees."
                onPointerDown={(e) => {
                  const centre = centreOf(placement);
                  if (!centre) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  gestureRef.current = {
                    type: "rotate",
                    pointerId: e.pointerId,
                    placementId: placement.id,
                    startRotation: placement.rotation,
                    startAngle: pointerAngleDeg(centre.cx, centre.cy, e.clientX, e.clientY),
                  };
                }}
                className="absolute left-1/2 top-0 z-30 flex h-11 w-11 -translate-x-1/2 -translate-y-[calc(100%+4px)] items-center justify-center"
              >
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 items-center justify-center border border-ink bg-paper-raised text-ink"
                >
                  <RotateGlyph />
                </span>
              </button>

              <button
                type="button"
                aria-label="Remove this logo from this view"
                onClick={() => setBoard((b) => removePlacement(b, placement.id))}
                className="absolute -right-3 -top-3 z-40 flex h-7 w-7 items-center justify-center border border-ink bg-paper-raised text-xs"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-graphite-ink">{label}</p>
        {selectedLogoId && image.url && (
          <button
            type="button"
            onClick={() => setBoard((b) => placeLogoOnView(b, image.url, selectedLogoId))}
            className="text-xs underline underline-offset-2 hover:text-fairway"
          >
            Place on this view
          </button>
        )}
      </div>
    </div>
  );
}

function RotateGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
        d="M3.2 8a4.8 4.8 0 1 1 1.5 3.5"
      />
      <path fill="currentColor" d="M3.2 12.2V8h4.2z" />
    </svg>
  );
}
