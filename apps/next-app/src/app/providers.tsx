"use client";

import { QueryProvider } from "@repo/ui/api";
import { ThemeProvider } from "@repo/ui/components/custom/theme-provider";
import type * as React from "react";

import { ENV } from "@/config/env";

/** Client-side context for the whole app; the layout itself stays a server component. */
export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<QueryProvider mode={ENV.MODE}>
			<ThemeProvider>{children}</ThemeProvider>
		</QueryProvider>
	);
}
