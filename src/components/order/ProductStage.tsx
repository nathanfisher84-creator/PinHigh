"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProductImage } from "@/components/catalogue/ProductImage";
import {
  applyLogoKey,
  clampCoord,
  clampScale,
  DEFAULT_TRANSFORM,
  MAX_SCALE,
  MIN_SCALE,
  normalizeRotation,
  pointerAngleDeg,
  pointerDistance,
  readLogoState,
  rotationFromDrag,
  scaleFromHandleDrag,
  writeLogoState,
  type LogoState,
} from "@/lib/logo-preview";

/**
 * The product stage: every angle the supplier pack carried, plus the buyer's
 * own logo laid over the photograph.
 *
 * The logo never leaves the browser. Previewing is a decision aid, not an
 * order artefact — the real artwork is uploaded with the quote request, where
 * it is stored privately (§8). Keeping the preview client-side makes it
 * instant, keeps trademarks off our servers until the buyer actually asks for
 * a quote, and means there is nothing to moderate.
 *
 * The logo is remembered in localStorage, so a buyer who uploads it once can
 * walk the whole catalogue trying it on everything — which is the point.
 * Position, size and rotation travel with it.
 */

const MAX_LOGO_BYTES = 4 * 1024 * 1024;
/** Stored downscaled: localStorage is small and a preview needs no more. */
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
  /** Rendered top-right over the stage (the condition tag). */
  badge?: React.ReactNode;
}

type Gesture =
  | { type: "move"; pointerId: number; dx: number; dy: number }
  | { type: "resize"; pointerId: number; startScale: number; startDist: number }
  | { type: "rotate"; pointerId: number; startRotation: number; startAngle: number };

/** Downscale raster logos on a canvas; keep SVGs as they are (they scale). */
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
  // PNG keeps transparency, which almost every logo has.
  return canvas.toDataURL("image/png");
}

function persist(state: LogoState | null) {
  if (typeof window === "undefined") return;
  writeLogoState(window.localStorage, state);
}

export function ProductStage({ images, articleNumber, styleName, colour, badge }: Props) {
  const [index, setIndex] = useState(0);
  const [logo, setLogo] = useState<LogoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const logoRef = useRef<LogoState | null>(null);
  const readyRef = useRef(false);

  logoRef.current = logo;
  readyRef.current = ready;

  const current = images[Math.min(index, Math.max(0, images.length - 1))] ?? null;

  // A logo uploaded on another product page is picked up here automatically,
  // including the last position, size and rotation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readLogoState(window.localStorage);
    if (stored) setLogo(stored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || gestureRef.current) return;
    persist(logo);
  }, [logo, ready]);

  useEffect(() => {
    return () => {
      if (readyRef.current) persist(logoRef.current);
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
      setLogo((currentLogo) => ({
        dataUrl,
        x: currentLogo?.x ?? DEFAULT_TRANSFORM.x,
        y: currentLogo?.y ?? DEFAULT_TRANSFORM.y,
        scale: currentLogo?.scale ?? DEFAULT_TRANSFORM.scale,
        rotation: currentLogo?.rotation ?? DEFAULT_TRANSFORM.rotation,
      }));
    } catch {
      setError("That file couldn't be read as an image. PNG with transparency works best.");
    }
  };

  const clearLogo = () => {
    setLogo(null);
  };

  const stageCentre = () => {
    const box = stageRef.current?.getBoundingClientRect();
    const currentLogo = logoRef.current;
    if (!box || !currentLogo) return null;
    return {
      box,
      cx: box.left + currentLogo.x * box.width,
      cy: box.top + currentLogo.y * box.height,
    };
  };

  const applyGesture = useCallback((e: PointerEvent) => {
    const gesture = gestureRef.current;
    const box = stageRef.current?.getBoundingClientRect();
    if (!gesture || gesture.pointerId !== e.pointerId || !box) return;

    if (gesture.type === "move") {
      const x = (e.clientX - box.left) / box.width - gesture.dx;
      const y = (e.clientY - box.top) / box.height - gesture.dy;
      setLogo((l) =>
        l ? { ...l, x: clampCoord(x, l.x), y: clampCoord(y, l.y) } : l,
      );
      return;
    }

    const currentLogo = logoRef.current;
    if (!currentLogo) return;
    const cx = box.left + currentLogo.x * box.width;
    const cy = box.top + currentLogo.y * box.height;

    if (gesture.type === "resize") {
      const dist = pointerDistance(cx, cy, e.clientX, e.clientY);
      const scale = scaleFromHandleDrag(gesture.startScale, gesture.startDist, dist);
      setLogo((l) => (l ? { ...l, scale } : l));
      return;
    }

    const angle = pointerAngleDeg(cx, cy, e.clientX, e.clientY);
    const rotation = rotationFromDrag(gesture.startRotation, gesture.startAngle, angle, e.shiftKey);
    setLogo((l) => (l ? { ...l, rotation } : l));
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => applyGesture(e);
    const onUp = (e: PointerEvent) => {
      if (gestureRef.current?.pointerId !== e.pointerId) return;
      gestureRef.current = null;
      persist(logoRef.current);
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

  const bindGesture = (gesture: Gesture) => {
    gestureRef.current = gesture;
  };

  const onMovePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const currentLogo = logoRef.current;
    const box = stageRef.current?.getBoundingClientRect();
    if (!currentLogo || !box) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    bindGesture({
      type: "move",
      pointerId: e.pointerId,
      dx: (e.clientX - box.left) / box.width - currentLogo.x,
      dy: (e.clientY - box.top) / box.height - currentLogo.y,
    });
  };

  const onResizePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const centre = stageCentre();
    const currentLogo = logoRef.current;
    if (!centre || !currentLogo) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    bindGesture({
      type: "resize",
      pointerId: e.pointerId,
      startScale: currentLogo.scale,
      startDist: pointerDistance(centre.cx, centre.cy, e.clientX, e.clientY),
    });
  };

  const onRotatePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const centre = stageCentre();
    const currentLogo = logoRef.current;
    if (!centre || !currentLogo) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    bindGesture({
      type: "rotate",
      pointerId: e.pointerId,
      startRotation: currentLogo.rotation,
      startAngle: pointerAngleDeg(centre.cx, centre.cy, e.clientX, e.clientY),
    });
  };

  /** Arrow keys nudge; [ ] rotate; - = resize. The stage is usable without a mouse (§11). */
  const onLogoKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!logo) return;
    const next = applyLogoKey(logo, e.key, e.shiftKey);
    if (!next) return;
    e.preventDefault();
    setLogo(next);
  };

  const degrees = logo ? Math.round(normalizeRotation(logo.rotation)) : 0;
  const sizePercent = logo ? Math.round(logo.scale * 100) : 0;

  return (
    <div>
      {/* Stage */}
      <div
        ref={stageRef}
        className="relative aspect-[4/5] bg-paper-sunken hairline overflow-hidden"
      >
        {current ? (
          <Image
            key={current.url}
            src={current.url}
            alt={current.alt ?? `${styleName} in ${colour}`}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
            className="object-cover select-none"
            draggable={false}
          />
        ) : (
          <ProductImage
            src={null}
            alt={`${styleName} in ${colour}`}
            articleNumber={articleNumber}
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
          />
        )}

        {badge && <span className="absolute right-0 top-0 z-10">{badge}</span>}

        {logo && current && (
          <div
            className="absolute z-20 touch-none"
            style={{
              left: `${logo.x * 100}%`,
              top: `${logo.y * 100}%`,
              width: `${logo.scale * 100}%`,
              transform: `translate(-50%, -50%) rotate(${logo.rotation}deg)`,
            }}
          >
            <button
              type="button"
              aria-label="Your logo — drag or use arrow keys to position it. Square brackets rotate, minus and plus resize."
              onPointerDown={onMovePointerDown}
              onKeyDown={onLogoKeyDown}
              className="relative block w-full cursor-grab bg-transparent p-0 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-fairway"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the buyer's own file */}
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
                onPointerDown={onResizePointerDown}
                onKeyDown={onLogoKeyDown}
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
              onPointerDown={onRotatePointerDown}
              onKeyDown={onLogoKeyDown}
              className="absolute left-1/2 top-0 z-30 flex h-11 w-11 -translate-x-1/2 -translate-y-[calc(100%+4px)] items-center justify-center"
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center border border-ink bg-paper-raised text-ink"
              >
                <RotateGlyph />
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Angles */}
      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto scroll-x" role="group" aria-label="Product views">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setIndex(i)}
              aria-pressed={i === index}
              aria-label={img.alt ?? `View ${i + 1}`}
              className={[
                "relative h-16 w-16 shrink-0 border transition-colors duration-150",
                i === index ? "border-ink" : "border-sand hover:border-graphite",
              ].join(" ")}
            >
              <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Logo controls */}
      <div className="mt-3 hairline bg-paper-raised px-3 py-2.5">
        {logo ? (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium">Your logo</span>
              <span className="text-xs text-graphite-ink">
                Drag it, resize from the corners, or rotate from the top handle.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex min-h-11 items-center gap-2 text-xs text-graphite-ink">
                Size
                <input
                  type="range"
                  min={Math.round(MIN_SCALE * 100)}
                  max={Math.round(MAX_SCALE * 100)}
                  value={sizePercent}
                  onChange={(e) =>
                    setLogo((l) => (l ? { ...l, scale: clampScale(Number(e.target.value) / 100) } : l))
                  }
                  className="h-11 w-28 accent-[var(--color-fairway)]"
                  aria-label="Logo size"
                  aria-valuetext={`${sizePercent} percent of the photo width`}
                />
                <span className="tabular w-8 text-ink">{sizePercent}%</span>
              </label>
              <label className="flex min-h-11 items-center gap-2 text-xs text-graphite-ink">
                Rotate
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={degrees}
                  onChange={(e) =>
                    setLogo((l) => (l ? { ...l, rotation: normalizeRotation(Number(e.target.value)) } : l))
                  }
                  className="h-11 w-28 accent-[var(--color-fairway)]"
                  aria-label="Logo rotation in degrees"
                  aria-valuetext={`${degrees} degrees`}
                />
                <span className="tabular w-8 text-ink">{degrees}°</span>
              </label>
              <button
                type="button"
                onClick={() => setLogo((l) => (l ? { ...l, rotation: 0 } : l))}
                className="min-h-11 min-w-11 px-2 text-xs underline underline-offset-2 hover:text-fairway"
                disabled={degrees === 0}
              >
                Straighten
              </button>
              <label className="flex min-h-11 cursor-pointer items-center text-xs underline underline-offset-2">
                Replace
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={(e) => onUpload(e.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                onClick={clearLogo}
                className="min-h-11 text-xs text-graphite-ink underline underline-offset-2 hover:text-flag-ink"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <label className="flex min-h-11 cursor-pointer items-center font-medium underline underline-offset-2 hover:text-fairway">
              See your logo on this
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(e) => onUpload(e.target.files?.[0])}
              />
            </label>
            <span className="text-xs text-graphite-ink">
              PNG with a transparent background works best. Stays on your device.
            </span>
          </div>
        )}
        {error && (
          <p className="mt-1.5 text-xs text-flag-ink" role="alert">
            {error}
          </p>
        )}
        {logo && (
          <p className="mt-1.5 text-xs text-graphite-ink">
            A visual mock-up only — exact position, size and application are confirmed with
            your quote.
          </p>
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
