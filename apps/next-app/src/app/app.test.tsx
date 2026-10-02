import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GET } from "./api/health/route";
import NotFound from "./not-found";
import Home from "./page";

describe("next-app", () => {
	it("answers the liveness probe, uncached", async () => {
		const response = GET();
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({ status: "ok" });
	});

	it("renders the home page with a ui Button as a link", () => {
		const html = renderToStaticMarkup(<Home />);
		expect(html).toContain("<h1");
		expect(html).toMatch(
			/<a[^>]*data-slot="button"[^>]*href="http:\/\/localhost:3000"|<a[^>]*href="http:\/\/localhost:3000"[^>]*data-slot="button"/,
		);
	});

	it("renders the 404 page with a way home", () => {
		const html = renderToStaticMarkup(<NotFound />);
		expect(html).toContain("404");
		expect(html).toContain('href="/"');
	});
});
