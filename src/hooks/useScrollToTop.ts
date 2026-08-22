import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** Scroll the page container to the top whenever the route changes. */
export function useScrollToTop<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { pathname, search } = useLocation();

  useEffect(() => {
    ref.current?.scrollTo({ top: 0, left: 0 });
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname, search]);

  return ref;
}
