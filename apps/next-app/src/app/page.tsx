import { Button } from "@repo/ui/components/ui/button";

import { ENV } from "@/config/env";

export default function Home() {
	return (
		<main className="container mx-auto flex flex-col gap-4 p-8">
			<h1 className="text-2xl font-semibold">{ENV.APP_TITLE}</h1>
			<p className="text-muted-foreground">
				Edit <code>src/app/page.tsx</code> to get started.
			</p>
			<div>
				<Button asChild>
					<a href={ENV.SERVER_URL}>API</a>
				</Button>
			</div>
		</main>
	);
}
