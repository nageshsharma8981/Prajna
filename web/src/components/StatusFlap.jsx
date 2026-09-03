// Small board-flap status chip; flips when its status changes.
import { useEffect, useRef, useState } from 'react';

export default function StatusFlap({ status }) {
  const [flip, setFlip] = useState(false);
  const prev = useRef(status);
  useEffect(() => {
    if (prev.current !== status) {
      prev.current = status;
      setFlip(true);
      const t = setTimeout(() => setFlip(false), 350);
      return () => clearTimeout(t);
    }
  }, [status]);
  return <span className={`sflap ${status}${flip ? ' flip' : ''}`}>{status}</span>;
}
