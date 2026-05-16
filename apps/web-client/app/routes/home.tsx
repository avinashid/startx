import type { Route } from "./+types/home";
export function meta({}: Route.MetaArgs) {
	return [{ title: "Startx Web App" }, { name: "description", content: "" }];
}

export default function Home() {
	return (
		<div className="flex flex-col w-fit">
			<div>Home</div>
		</div>
	);
}
