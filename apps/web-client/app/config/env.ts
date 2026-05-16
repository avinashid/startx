export const ENV = {
	SERVER_URL: import.meta.env.VITE_SERVER_URL,
	APP_TITLE: import.meta.env.VITE_APP_TITLE ?? "Web App",
	MODE: (import.meta.env.MODE ?? "development") as "development" | "production" | "staging",
};
