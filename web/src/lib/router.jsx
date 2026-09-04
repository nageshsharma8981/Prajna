// Minimal pushState router: useRoute() returns the current path, navigate(to)
// changes it. Deliberately tiny: the app has six surfaces.
import { useEffect, useState } from 'react';

const listeners = new Set();

export function navigate(to) {
  if (to === location.pathname + location.search) return;
  history.pushState(null, '', to);
  listeners.forEach((fn) => fn(location.pathname));
}

export function useRoute() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const fn = (p) => setPath(p);
    listeners.add(fn);
    const pop = () => fn(location.pathname);
    addEventListener('popstate', pop);
    return () => {
      listeners.delete(fn);
      removeEventListener('popstate', pop);
    };
  }, []);
  return path;
}

// A modified or secondary click (new tab/window, context menu) is the
// browser's business, only a plain primary click becomes SPA navigation.
function isPlainClick(e) {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export function Link({ to, children, onClick, ...rest }) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (!isPlainClick(e)) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
