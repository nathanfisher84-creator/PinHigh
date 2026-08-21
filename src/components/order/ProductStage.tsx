"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProductImage } from "@/components/catalogue/ProductImage";

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
 */

const LOGO_KEY = "ph_buyer_logo";
const MAX_LOGO_BYTES = 4 * 1024 * 1024;
/** Stored downscaled: localStorage is small and a preview needs no more. */
const MAX_LOGO_EDGE = 600;

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

interface LogoState {
  dataUrl: string;
  /** Centre of the logo, as fractions of the stage box. */
  x: number;
  y: number;
  /** Logo width as a fraction of stage width. */
  scale: number;
}

function readStoredLogo(): string | null {
  try {
    return localStorage.getItem(LOGO_KEY);
  } catch {
    return null;
  }
}

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

export function ProductStage({ images, articleNumber, styleName, colour, badge }: Props) {
  const [index, setIndex] = useState(0);
  const [logo, setLogo] = useState<LogoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);

  const current = images[Math.min(index, Math.max(0, images.length - 1))] ?? null;

  // A logo uploaded on another product page is picked up here automatically.
  useEffect(() => {
    const stored = readStoredLogo();
    if (stored) setLogo({ dataUrl: stored, x: 0.5, y: 0.42, scale: 0.18 });
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
      try {
        localStorage.setItem(LOGO_KEY, dataUrl);
      } catch {
        // Storage full or blocked: the preview still works for this page.
      }
      setLogo({ dataUrl, x: 0.5, y: 0.42, scale: 0.18 });
    } catch {
      setError("That file couldn't be read as an image. PNG with transparency works best.");
    }
  };

  const clearLogo = () => {
    setLogo(null);
    try {
      localStorage.removeItem(LOGO_KEY);
    } catch {
      /* nothing to clear */
    }
  };

  /* -- Dragging ---------------------------------------------------------- */

  const onLogoPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!logo || !stageRef.current) return;
      const box = stageRef.current.getBoundingClientRect();
      dragRef.current = {
        pointerId: e.pointerId,
        dx: (e.clientX - box.left) / box.width - logo.x,
        dy: (e.clientY - box.top) / box.height - logo.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [logo],
  );

  const onLogoPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId || !stageRef.current) return;
      const box = stageRef.current.getBoundingClientRect();
      const x = (e.clientX - box.left) / box.width - drag.dx;
      const y = (e.clientY - box.top) / box.height - drag.dy;
      setLogo((l) =>
        l ? { ...l, x: Math.min(0.98, Math.max(0.02, x)), y: Math.min(0.98, Math.max(0.02, y)) } : l,
      );
    },
    [],
  );

  const onLogoPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }, []);

  /** Arrow keys nudge; the stage is usable without a mouse (§11). */
  const onLogoKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = move[e.key];
    if (!delta) return;
    e.preventDefault();
    setLogo((l) =>
      l
        ? {
            ...l,
            x: Math.min(0.98, Math.max(0.02, l.x + delta[0])),
            y: Math.min(0.98, Math.max(0.02, l.y + delta[1])),
          }
        : l,
    );
  }, []);

  return (
    <div>
      {/* Stage */}
      <div
        ref={stageRef}
        className="studio relative aspect-[4/5] overflow-hidden"
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
          <button
            type="button"
            aria-label="Your logo — drag or use arrow keys to position it"
            onPointerDown={onLogoPointerDown}
            onPointerMove={onLogoPointerMove}
            onPointerUp={onLogoPointerUp}
            onKeyDown={onLogoKeyDown}
            className="absolute z-20 touch-none cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-fairway"
            style={{
              left: `${logo.x * 100}%`,
              top: `${logo.y * 100}%`,
              width: `${logo.scale * 100}%`,
              transform: "translate(-50%, -50%)",
              background: "transparent",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the buyer's own file */}
            <img
              src={logo.dataUrl}
              alt=""
              draggable={false}
              className="no-blend pointer-events-none h-auto w-full select-none drop-shadow-[0_1px_2px_rgba(20,24,26,0.25)]"
            />
          </button>
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-medium">Your logo</span>
            <label className="flex items-center gap-2 text-xs text-graphite-ink">
              Size
              <input
                type="range"
                min={6}
                max={45}
                value={Math.round(logo.scale * 100)}
                onChange={(e) =>
                  setLogo((l) => (l ? { ...l, scale: Number(e.target.value) / 100 } : l))
                }
                className="accent-[var(--color-fairway)]"
                aria-label="Logo size"
              />
            </label>
            <span className="text-xs text-graphite-ink">Drag it anywhere on the photo.</span>
            <label className="cursor-pointer text-xs underline underline-offset-2 -m-2 p-2">
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
              className="text-xs text-graphite-ink underline underline-offset-2 hover:text-flag-ink -m-2 p-2"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <label className="cursor-pointer font-medium underline underline-offset-2 hover:text-fairway">
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
