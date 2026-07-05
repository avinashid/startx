import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router";

type StringRecord = Record<string, string | number>;

export type UseUrlParamsReturn<T extends StringRecord> = {
	params: T;
	setParam: <K extends keyof T>(key: K, value: T[K]) => void;
	setParams: (values: Partial<T>) => void;
};

function getParams<T extends StringRecord>(searchParams: URLSearchParams, defaults: T): T {
	const result = {} as T;

	for (const key of Object.keys(defaults) as Array<keyof T>) {
		result[key] = (searchParams.get(key as string) ?? defaults[key]) as T[keyof T];
	}

	return result;
}

export function useUrlParams<T extends StringRecord>(defaults: T): UseUrlParamsReturn<T> {
	const [searchParams, setSearchParams] = useSearchParams();

	const params = getParams(searchParams, defaults);

	// Ensure non-empty defaults exist in URL
	useEffect(() => {
		let changed = false;
		const next = new URLSearchParams(searchParams);

		for (const [key, value] of Object.entries(defaults)) {
			if (value === "") continue;

			if (!next.has(key)) {
				if (typeof value === "string") next.set(key, value);
				else next.set(key, String(value));
				changed = true;
			}
		}

		if (changed) {
			setSearchParams(next, { replace: true });
		}
	}, [searchParams, defaults, setSearchParams]);

	const setParam = useCallback(
		<K extends keyof T>(key: K, value: T[K]) => {
			setSearchParams((current) => {
				const next = new URLSearchParams(current);

				if (value === "") {
					next.delete(key as string);
				} else {
					if (typeof value === "string") next.set(key as string, value);
					else next.set(key as string, String(value));
				}

				return next;
			});
		},
		[setSearchParams],
	);

	const setParams = useCallback(
		(values: Partial<T>) => {
			setSearchParams((current) => {
				const next = new URLSearchParams(current);

				for (const [key, value] of Object.entries(values)) {
					if (value == null || value === "") {
						next.delete(key);
					} else {
						next.set(key, value as string);
					}
				}

				return next;
			});
		},
		[setSearchParams],
	);

	return {
		params,
		setParam,
		setParams,
	};
}

export function useUrlParamsValue<T extends StringRecord>(defaults: T): T {
	const [searchParams] = useSearchParams();

	return getParams(searchParams, defaults);
}
