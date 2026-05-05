/* eslint-disable id-denylist */
import { useRef, useCallback, useEffect } from 'react';

const useInterval = (callback: () => void, interval: number) => {
	const intervalIdRef = useRef<number | null>(null);
	const savedCallback = useRef<() => void>(null);

	// Remember the latest callback.
	useEffect(() => {
		savedCallback.current = callback;
	}, [callback]);

	const start = useCallback(() => {
		if (intervalIdRef.current !== null) return; // Prevent multiple intervals
		intervalIdRef.current = window.setInterval(() => {
			if (savedCallback.current) savedCallback.current();
		}, interval);
	}, [interval]);

	const clear = useCallback(() => {
		if (intervalIdRef.current !== null) {
			clearInterval(intervalIdRef.current);
			intervalIdRef.current = null;
		}
	}, []);

	// Clear interval on component unmount
	useEffect(() => {
		return () => clear();
	}, [clear]);

	return { start, clear };
};

export { useInterval };
