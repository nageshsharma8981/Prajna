// Minimal pushState router: useRoute() returns the current path, navigate(to)
// changes it. Deliberately tiny — the app has six surfaces.
import { useEffect, useState, useCallback } from 'react';

const listeners = new Set();

export function navigate(to) {
  if (to === location.pathname) return;
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

export function Link({ to, children, ...rest }) {
  const onClick = useCallback(
    (e) => {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      navigate(to);
    },
    [to]
  );
  return (
    <a href={to} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}
