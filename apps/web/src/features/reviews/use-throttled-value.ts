import { useEffect, useRef, useState } from 'react';

/** `value`, updated at most once per `intervalMs` (the latest value always lands at the end). */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(0);

  useEffect(() => {
    const wait = Math.max(0, lastUpdate.current + intervalMs - Date.now());
    const timer = window.setTimeout(() => {
      lastUpdate.current = Date.now();
      setThrottled(value);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [value, intervalMs]);

  return throttled;
}
