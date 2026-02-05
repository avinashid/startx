import { useState, useRef, useEffect } from "react";

type TimerHook = {
  counter: number;
  start: () => void;
  reset: () => void;
  clear: () => void;
};

export function useTimer(initialSeconds: number): TimerHook {
  const [counter, setCounter] = useState(initialSeconds);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Cleanup on component unmount or when counter changes
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const start = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setCounter((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
  };

  const reset = () => {
    setCounter(initialSeconds);
    clear();
  };

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  };

  useEffect(() => {
    if (counter > 0) {
      start();
    }
  }, [counter]);

  return { counter, start, reset, clear };
}
