import { useState, useEffect } from 'react';

function useDebounce<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		// Update debounced value after delay
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		// Clear timeout on cleanup to prevent memory leaks
		return () => {
			clearTimeout(handler);
		};
	}, [value, delay]);

	return debouncedValue;
}

export { useDebounce };
