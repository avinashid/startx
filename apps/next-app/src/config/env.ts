/**
 * Public, build-time configuration. Next.js inlines `process.env.NEXT_PUBLIC_*` into the client
 * bundle when it sees the literal property access, so each variable has to be spelled out here;
 * reading `process.env[name]` dynamically gives `undefined` in the browser. Anything secret belongs
 * in a server-only module, never under the NEXT_PUBLIC_ prefix.
 */
export const ENV = {
	SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000",
	APP_TITLE: process.env.NEXT_PUBLIC_APP_TITLE ?? "Next App",
	MODE: process.env.NODE_ENV === "production" ? "production" : "development",
} as const;
