"use client";

// A canvas overlay that draws a fading CHALK TRAIL as the cursor moves across the
// board — grainy jittered dots (like real chalk on slate) laid down on mousemove,
// then slowly erased each frame so the line fades. Fixed behind the content,
// pointer-events off. Disabled for touch / reduced-motion.
import { useEffect, useRef } from "react";

export default function ChalkCursor() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return; // no cursor on touch
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    // Lay chalk grains along the segment from the previous point to the new one.
    let last: { x: number; y: number } | null = null;
    const grain = (x: number, y: number) => {
      const n = 2 + (Math.random() * 3) | 0;
      for (let i = 0; i < n; i++) {
        const r = 0.5 + Math.random() * 1.7;
        ctx.fillStyle = `rgba(238,243,236,${0.10 + Math.random() * 0.28})`;
        ctx.beginPath();
        ctx.arc(x + (Math.random() - 0.5) * 5, y + (Math.random() - 0.5) * 5, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const onMove = (e: MouseEvent) => {
      const x = e.clientX, y = e.clientY;
      if (last) {
        const dist = Math.hypot(x - last.x, y - last.y);
        const steps = Math.max(1, Math.min(40, dist / 3));
        for (let i = 0; i <= steps; i++) grain(last.x + ((x - last.x) * i) / steps, last.y + ((y - last.y) * i) / steps);
      } else {
        grain(x, y);
      }
      last = { x, y };
    };
    window.addEventListener("mousemove", onMove);

    // Erase a sliver each frame so the trail fades out behind the cursor.
    let raf = 0;
    const fade = () => {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.055)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(fade);
    };
    fade();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="chalk-cursor" aria-hidden="true" />;
}
