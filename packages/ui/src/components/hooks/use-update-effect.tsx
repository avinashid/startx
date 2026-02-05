import type React from 'react';
import { useEffect, useRef } from 'react';

const useDidMountEffect = (func: React.EffectCallback, deps: React.DependencyList) => {
	const didMount = useRef(false);

	useEffect(() => {
		if (didMount.current) func();
		else didMount.current = true;
	}, deps);
};

export { useDidMountEffect };
