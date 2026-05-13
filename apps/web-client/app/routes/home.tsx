import { ping } from "@repo/common/constants";
import { useTheme, themes } from "@repo/ui/components/custom/theme-provider";
import { Button } from "@repo/ui/components/ui/button";
import type { Route } from "./+types/home";
export function meta({}: Route.MetaArgs) {
	return [{ title: "Startx Web App" }, { name: "description", content: "" }];
}

export default function Home() {
	const theme = useTheme();
	return (
		<div className="flex flex-col w-fit">
			<Button
				onClick={() => {
					theme.setMode(theme.mode === "light" ? "dark" : "light");
				}}
			>
				Toggle {theme.mode === "light" ? "dark" : "light"} {ping}
			</Button>
			<div>
				{Object.entries(themes).map(([e]) => (
					<Button key={e} onClick={() => theme.setColor(e as "blue")}>
						Switch to {e}
					</Button>
				))}
			</div>
		</div>
	);
}
