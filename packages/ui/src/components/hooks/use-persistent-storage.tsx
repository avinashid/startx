'use client';
import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
	// Retrieve stored value from localStorage, or use initialValue if none is found
	const getStoredValue = (): T => {
		// if (typeof window === "undefined") return initialValue;
		const storedValue = localStorage.getItem(key);
		if (storedValue !== null) {
			try {
				return JSON.parse(storedValue) as T;
			} catch (error) {
				console.error('Error parsing stored value:', error);
			}
		}
		return initialValue;
	};

	const [value, setValue] = useState<T>(getStoredValue);

	useEffect(() => {
		localStorage.setItem(key, JSON.stringify(value));
	}, [key, value]);

	return [value, setValue];
}

export function useSessionStorage<T>(
	key: string,
	initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
	// Retrieve stored value from localStorage, or use initialValue if none is found
	const getStoredValue = (): T => {
		const storedValue = sessionStorage.getItem(key);
		if (storedValue !== null) {
			try {
				return JSON.parse(storedValue) as T;
			} catch (error) {
				console.error('Error parsing stored value:', error);
			}
		}
		return initialValue;
	};

	const [value, setValue] = useState<T>(getStoredValue);

	useEffect(() => {
		sessionStorage.setItem(key, JSON.stringify(value));
	}, [key, value]);

	return [value, setValue];
}
