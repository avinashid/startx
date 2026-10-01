import { data } from "react-router";

// Unknown paths match this splat route instead of matching nothing. An unmatched URL is a router
// error at the moment of hydration, so React rendered the ErrorBoundary against a prerendered shell
// that holds the root HydrateFallback, and threw #418 (B77). Throwing from a clientLoader lets
// hydration finish on the fallback first; the root ErrorBoundary then renders the 404.
export function clientLoader() {
	// React Router's error-response idiom: the root ErrorBoundary reads it with isRouteErrorResponse.
	// eslint-disable-next-line @typescript-eslint/only-throw-error
	throw data(null, { status: 404 });
}

export default function NotFound() {
	return null;
}
