// Solari split-flap text. Each cell cycles through characters before settling,
// staggered left to right, whenever the text changes (and once on mount).
import { useEffect, useRef, useState } from 'react';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·- ';

export default function SplitFlap({ text, size = '1rem', className = '' }) {
  const target = text.toUpperCase();
  const [cells, setCells] = useState(() => Array.from(target, () => ' '));
  const [spinning, setSpinning] = useState(() => Array.from(target, () => false));
  const timers = useRef([]);

  useEffect(() => {
    timers.current.forEach(clearInterval);
    timers.current = [];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const chars = Array.from(target);
    if (reduced) {
      setCells(chars);
      setSpinning(chars.map(() => false));
      return;
    }
    setCells((prev) => chars.map((_, i) => prev[i] ?? ' '));
    setSpinning(chars.map(() => true));
    chars.forEach((ch, i) => {
      let tick = 0;
      const spins = 3 + Math.floor(i * 1.3) + Math.floor(Math.random() * 3);
      const iv = setInterval(() => {
        tick++;
        if (tick >= spins) {
          clearInterval(iv);
          setCells((prev) => {
            const next = [...prev];
            next[i] = ch;
            return next;
          });
          setSpinning((prev) => {
            const next = [...prev];
            next[i] = false;
            return next;
          });
        } else {
          setCells((prev) => {
            const next = [...prev];
            next[i] = CHARSET[Math.floor(Math.random() * CHARSET.length)];
            return next;
          });
        }
      }, 52 + i * 4);
      timers.current.push(iv);
    });
    return () => timers.current.forEach(clearInterval);
  }, [target]);

  return (
    <span className={`flapline ${className}`} style={{ fontSize: size }} aria-label={target} role="text">
      {cells.map((c, i) => (
        <span key={i} aria-hidden="true" className={`flap-cell${c === ' ' ? ' blank' : ''}${spinning[i] ? ' spin' : ''}`}>
          {c === ' ' ? '·' : c}
        </span>
      ))}
    </span>
  );
}
