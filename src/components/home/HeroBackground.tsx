"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * The hero's background layer: the owner's uploaded images, crossfading when
 * rotation is on. Falls back to the bundled course photograph when nothing
 * is uploaded, so the hero can never render empty.
 *
 * Motion rules: rotation only runs with 2+ images AND rotation enabled AND
 * the visitor not preferring reduced motion — then a slow 6s cycle with a
 * gentle fade, never a slide or a bounce.
 */
const INTERVAL_MS = 6000;

export function HeroBackground({
  images,
  rotate,
}: {
  images: string[];
  rotate: boolean;
}) {
  const list = images.length > 0 ? images : ["/hero/course.webp"];
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!rotate || list.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      setActive((i) => (i + 1) % list.length);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [rotate, list.length]);

  return (
    <>
      {list.map((url, i) => (
        <Image
          key={url}
          src={url}
          alt=""
          fill
          priority={i === 0}
          sizes="100vw"
          className={[
            "object-cover transition-opacity duration-1000 ease-[var(--ease-out-quiet)]",
            i === active ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />
      ))}
    </>
  );
}
