'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts a number up to `value` the first time it scrolls into view. Progressive: renders the
 * final value immediately without JS or under prefers-reduced-motion, so it's never blank and
 * never animates when motion is unwelcome.
 */
export function CountUp({
  value,
  decimals = 0,
  durationMs = 1100,
  prefix = '',
  suffix = '',
  separator = ',',
  className,
}: {
  value: number;
  decimals?: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  separator?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(value);
  const started = useRef(false);

  function format(n: number) {
    const fixed = n.toFixed(decimals);
    const [int, frac] = fixed.split('.');
    const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    return `${prefix}${grouped}${frac ? '.' + frac : ''}${suffix}`;
  }

  useEffect(() => {
    const node = ref.current;
    if (!node || started.current) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    setDisplay(0);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || started.current) continue;
          started.current = true;
          io.disconnect();
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / durationMs);
            // easeOutCubic
            const eased = 1 - Math.pow(1 - t, 3);
            setDisplay(value * eased);
            if (t < 1) requestAnimationFrame(tick);
            else setDisplay(value);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {format(display)}
    </span>
  );
}
