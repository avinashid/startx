'use client';
import { useEffect, useState } from 'react';

type WindowDimensions = {
	width: number | undefined;
	height: number | undefined;
};

const useWindowDimensions = (): WindowDimensions => {
	const win = typeof window !== 'undefined' ? window : undefined;
	const [windowDimensions, setWindowDimensions] = useState<WindowDimensions>({
		width: win && window?.innerWidth,
		height: win && window?.innerHeight,
	});
	useEffect(() => {
		function handleResize(): void {
			setWindowDimensions({
				width: window?.innerWidth,
				height: window?.innerHeight,
			});
		}
		handleResize();
		window.addEventListener('resize', handleResize);
		return (): void => window.removeEventListener('resize', handleResize);
	}, []);

	return windowDimensions;
};

export { useWindowDimensions };
