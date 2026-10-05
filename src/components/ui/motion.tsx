'use client';

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

/**
 * Text, dessen Buchstaben einzeln von unten aufsteigen (Fernly-Headline).
 * Screenreader lesen den ganzen Text über aria-label.
 */
export function SplitText({
  text,
  as: Tag = 'span',
  className = '',
  delay = 0,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  delay?: number;
}) {
  let i = 0;
  const words = text.trim().split(/\s+/);
  return (
    <Tag className={`fx-split ${className}`} aria-label={text} style={{ '--d': `${delay}ms` } as React.CSSProperties}>
      {words.map((word, wi) => (
        <span key={wi} aria-hidden="true">
          <span className="word">
            {[...word].map((ch, ci) => (
              <span key={ci} className="ch" style={{ '--i': i++ } as React.CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
          {wi < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </Tag>
  );
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Zahl, die von 0 hochzählt (power3.out). Formatierung auf Deutsch.
 */
export function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = 1300,
  delay = 0,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  delay?: number;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);

  useEffect(() => {
    let raf = 0;
    if (reducedMotion()) {
      raf = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(raf);
    }
    const start = from.current;
    let t0 = 0;
    const tick = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, Math.max(0, (t - t0 - delay) / duration));
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay]);

  const text = shown.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span aria-label={`${prefix}${value.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

/** Einzelnes Element, das hochgleitet (Karten). */
export function Rise({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: ElementType;
}) {
  return (
    <Tag className={`fx-rise ${className}`} style={{ '--d': `${delay}ms` } as React.CSSProperties}>
      {children}
    </Tag>
  );
}

const CARD_SELECTOR = [
  '[data-rise]',
  '.rounded-xl.bg-white',
  '.rounded-2xl.bg-white',
  '.rounded-xl.bg-card',
  '.rounded-2xl.bg-card',
  '.fx-hero',
  'table',
].join(',');

/**
 * Lässt beim Seitenwechsel die Karten im Inhaltsbereich nacheinander hochgleiten.
 * Nutzt die Web Animations API, damit React-verwaltete Attribute unberührt bleiben.
 */
export function useBoardReveal(ref: React.RefObject<HTMLElement | null>, key: string) {
  useEffect(() => {
    const root = ref.current;
    if (!root || reducedMotion() || typeof root.animate !== 'function') return;

    const animated = new WeakSet<Element>();
    let count = 0;

    const reveal = () => {
      const all = Array.from(root.querySelectorAll(CARD_SELECTOR));
      // Nur äußerste Karten, keine verschachtelten
      const outer = all.filter((el) => {
        const parent = el.parentElement?.closest(CARD_SELECTOR);
        return !parent || !root.contains(parent);
      });
      for (const el of outer) {
        if (animated.has(el)) continue;
        animated.add(el);
        if (count >= 18) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top > window.innerHeight + 200) continue;
        el.animate(
          [
            { opacity: 0, transform: 'translateY(36px) scale(.985)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 850, delay: 120 + count * 70, easing: 'cubic-bezier(.33, 1, .68, 1)', fill: 'backwards' },
        );
        count++;
      }
    };

    reveal();
    // Daten laden oft nach – neu auftauchende Karten kurz danach noch mitnehmen
    const mo = new MutationObserver(() => reveal());
    mo.observe(root, { childList: true, subtree: true });
    const stop = setTimeout(() => mo.disconnect(), 1500);
    return () => {
      mo.disconnect();
      clearTimeout(stop);
    };
  }, [ref, key]);
}
