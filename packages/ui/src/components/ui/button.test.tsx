import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
	it("renders a <button> with its children", () => {
		const html = renderToStaticMarkup(<Button>Save</Button>);
		expect(html).toMatch(/^<button[^>]*data-slot="button"/);
		expect(html).toContain("Save");
	});

	it("renders as its child with asChild, keeping the child's own props (B90)", () => {
		const html = renderToStaticMarkup(
			<Button asChild variant="outline">
				<a href="/docs">Docs</a>
			</Button>,
		);
		expect(html).toMatch(/^<a[^>]*href="\/docs"/);
		expect(html).toMatch(/^<a[^>]*data-slot="button"/);
		expect(html).toMatch(/^<a[^>]*data-variant="outline"/);
		expect(html).not.toContain("<button");
		expect(html).toContain("Docs</a>");
	});
});
