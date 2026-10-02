import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The workspace root: standalone output traces files from here, and Turbopack resolves the
// workspace packages (consumed as TypeScript source) from it.
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
	// A self-contained server in .next/standalone, which is what the Dockerfile ships.
	output: "standalone",
	outputFileTracingRoot: workspaceRoot,
	turbopack: { root: workspaceRoot },
	// Workspace libraries ship TypeScript source, not a build.
	transpilePackages: ["@repo/ui"],
	poweredByHeader: false,
	reactStrictMode: true,
};

export default nextConfig;
