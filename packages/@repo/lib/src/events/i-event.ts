type IEventWithPayload<T extends Record<string, unknown>> = {
	[K in keyof T]: { event: K; payload: T[K] };
}[keyof T];

export class IEvent<T extends Record<string, unknown>> {
	private listeners: { [K in keyof T]?: Array<(payload: T[K]) => void> } = {};
	private onceListeners: { [K in keyof T]?: Array<(payload: T[K]) => void> } = {};
	private everyListeners: Array<(e: IEventWithPayload<T>) => void> = [];

	on<K extends keyof T>(event: K, handler: (payload: T[K]) => void) {
		(this.listeners[event] ||= []).push(handler);
		return () => this.off(event, handler);
	}

	once<K extends keyof T>(event: K, handler: (payload: T[K]) => void) {
		(this.onceListeners[event] ||= []).push(handler);
		return () => this.off(event, handler);
	}

	off<K extends keyof T>(event: K, handler: (payload: T[K]) => void) {
		if (this.listeners[event]) {
			this.listeners[event] = this.listeners[event].filter(fn => fn !== handler);
		}
		if (this.onceListeners[event]) {
			this.onceListeners[event] = this.onceListeners[event].filter(fn => fn !== handler);
		}
	}

	onEvery(handler: (e: IEventWithPayload<T>) => void) {
		this.everyListeners.push(handler);
		return () => {
			this.everyListeners = this.everyListeners.filter(h => h !== handler);
		};
	}

	emit<K extends keyof T>(event: K, payload: T[K]) {
		const everyList = [...this.everyListeners];
		for (const h of everyList) {
			h({ event, payload } as IEventWithPayload<T>);
		}

		const list = this.listeners[event];
		if (list) {
			for (const h of [...list]) h(payload);
		}

		const onceList = this.onceListeners[event];
		if (onceList && onceList.length > 0) {
			this.onceListeners[event] = [];
			for (const h of [...onceList]) h(payload);
		}
	}

	emitOnce<K extends keyof T>(event: K, payload: T[K]) {
		this.emit(event, payload);
		this.listeners[event] = [];
		this.onceListeners[event] = [];
	}
}
