"use client";

// Scroll-reveal wrapper: slides + un-rotates its children into place the first
// time they enter the viewport (IntersectionObserver). Gives sections the sense of
// being pinned onto the board as you scroll. Honors prefers-reduced-motion.
import { useEffect, useRef, useState, type ReactNode } from "react";

export default function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(true); return; }
    // Already on screen at mount (above the fold)? Reveal right away.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) { setShown(true); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${shown ? "reveal-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
