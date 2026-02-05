/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Store<T = Record<string, any>> {
	_store: T;
	get(key: string): string | null;
	set(key: string, value: string): void;
}

export const InMemoryStorage: Store = {
	_store: {},
	get(key: string): string | null {
		return this._store[key];
	},
	set(key: string, value: string): void {
		this._store[key] = value;
	},
};

export const SessionStorageStore: Store = {
	_store: {},
	get(key: string): string | null {
		return sessionStorage.getItem(key);
	},
	set(key: string, value: string): void {
		sessionStorage.setItem(key, value);
	},
};

export const LocalStorageStore: Store = {
	_store: {},
	get(key: string): string | null {
		return localStorage.getItem(key);
	},
	set(key: string, value: string): void {
		localStorage.setItem(key, value);
	},
};
