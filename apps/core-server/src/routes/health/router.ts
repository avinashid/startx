import type { Health } from "@repo/observability";
import { Router } from "express";

/**
 * `GET /health` is liveness (the process answers; restart it if not) and `GET /ready` is readiness
 * (route traffic here; 503 while a dependency is down or a shutdown is draining). Mounted ahead of
 * every other middleware, so probes are never rate-limited, CORS-checked, traced or logged.
 */
export const createHealthRouter = (health: Health): Router => {
	const router = Router();

	// Per handler, not router.use: mounted at the root, a router-level middleware runs for every request.
	router.get("/health", (_req, res) => {
		res.set("Cache-Control", "no-store").json(health.liveness());
	});
	router.get("/ready", async (_req, res) => {
		const readiness = await health.readiness();
		res
			.set("Cache-Control", "no-store")
			.status(readiness.ok ? 200 : 503)
			.json(readiness);
	});

	return router;
};
