// Evaluated per request, never prerendered: a liveness probe has to reach the running server.
export const dynamic = "force-dynamic";

/** Liveness for the container HEALTHCHECK and the orchestrator: the server answers. */
export function GET() {
	return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
