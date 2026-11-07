import { useEffect, useRef } from "react";

/**
 * Koppelt een DOM-event aan een Polaris web component via een ref.
 * (React 18 koppelt events op custom elements niet altijd betrouwbaar via props.)
 */
export function useElementEvent<T extends HTMLElement>(eventName: string, handler: (event: Event & { currentTarget: T }) => void) {
  const ref = useRef<T>(null);
  const handlerRef = useRef(handler);

  // Altijd de laatste handler gebruiken zonder de listener opnieuw te koppelen.
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const listener = (event: Event) => handlerRef.current(event as Event & { currentTarget: T });
    el.addEventListener(eventName, listener);
    return () => el.removeEventListener(eventName, listener);
  }, [eventName]);

  return ref;
}
