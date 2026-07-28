'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Progressive scroll-reveal. Content is fully visible without JS (the `.reveal` base state);
 * when JS is present (`html.js`) it starts translated/faded and animates in once on first
 * intersection. Respects prefers-reduced-motion.
 *
 * Requires the companion stylesheet: `@import '@axa/platform/css/motion';`
 */
export function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  as?: 'div' | 'section' | 'li' | 'span' | 'header';
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || shown) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [shown]);

  return (
    <Tag
      ref={ref as never}
      data-shown={shown ? 'true' : 'false'}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn('reveal', className)}
    >
      {children}
    </Tag>
  );
}
