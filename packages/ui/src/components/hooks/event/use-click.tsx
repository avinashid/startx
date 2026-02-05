/* eslint-disable id-denylist */
import { type RefObject, useEffect } from 'react';

function useOutsideClick<T extends HTMLElement>(
	ref: RefObject<T | null>,
	callback: () => void,
): void {
	useEffect(() => {
		const handleClickOrTouch = (event: Event) => {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				callback();
			}
		};

		document.addEventListener('mousedown', handleClickOrTouch);

		return () => {
			document.removeEventListener('mousedown', handleClickOrTouch);
		};
	}, [ref, callback]);
}

function useInsideClick<T extends HTMLElement>(ref: RefObject<T>, callback: () => void): void {
	useEffect(() => {
		const handleClickOrTouch = (event: Event) => {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				callback();
			}
		};

		document.addEventListener('mousedown', handleClickOrTouch);

		return () => {
			document.removeEventListener('mousedown', handleClickOrTouch);
		};
	}, [ref, callback]);
}

export { useInsideClick, useOutsideClick };
