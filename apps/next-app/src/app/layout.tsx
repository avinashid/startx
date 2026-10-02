import "./globals.css";

import type { Metadata } from "next";
import type * as React from "react";

import { ENV } from "@/config/env";

import { Providers } from "./providers";

export const metadata: Metadata = {
	title: ENV.APP_TITLE,
	description: "",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		// ThemeProvider sets the light/dark class on <html> after hydration.
		<html lang="en" suppressHydrationWarning>
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
