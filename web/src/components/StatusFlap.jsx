// Small board-flap status chip; flips when its status changes. Internal
// enums stay (FILLED/KILLED); the lettering speaks plainly.
import { useEffect, useRef, useState } from 'react';

const LABELS = {
  FILLED: 'DONE',
  KILLED: 'STOPPED',
  PAUSED_ATTENTION: 'ATTN',
  PAUSED_CEILING: 'CEILING',
};

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
  return <span className={`sflap ${status}${flip ? ' flip' : ''}`}>{LABELS[status] || status}</span>;
}
