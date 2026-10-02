import Link from "next/link";

export default function NotFound() {
	return (
		<main className="container mx-auto flex flex-col gap-2 p-8">
			<h1 className="text-2xl font-semibold">404</h1>
			<p>The requested page could not be found.</p>
			<Link className="underline" href="/">
				Back home
			</Link>
		</main>
	);
}
