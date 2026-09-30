import type { PackageItem } from "./cli-utils";

/**
 * Lookup is deliberately lenient: a `requiredDeps` entry may name either the
 * package.json `name` or the template directory name. No two templates share a
 * `PackageItem.name` today, so the two can never disagree — revisit if that changes.
 */
export const findPackageByName = (packages: PackageItem[], name: string) =>
	packages.find((pkg) => pkg.name === name || pkg.packageJson?.name === name);

/**
 * Breadth-first closure over `startx.requiredDeps` / `startx.requiredDevDeps`.
 * Shared by `startx init` and `startx package add` so both commands agree on
 * what "required" means for a chain A → B → C.
 */
export const resolvePackageClosure = (props: {
	packages: PackageItem[];
	seeds: PackageItem[];
	includeEslintConfig?: boolean;
}): PackageItem[] => {
	const resolved = new Map<string, PackageItem>();
	const queue = [...props.seeds];
	const enqueue = (name: string) => {
		const pkg = findPackageByName(props.packages, name);
		if (pkg && !resolved.has(pkg.name)) queue.push(pkg);
	};

	if (props.includeEslintConfig) enqueue("eslint-config");

	while (queue.length > 0) {
		const pkg = queue.shift()!;
		if (resolved.has(pkg.name)) continue;

		resolved.set(pkg.name, pkg);
		for (const dep of [
			...(pkg.packageJson?.startx?.requiredDeps ?? []),
			...(pkg.packageJson?.startx?.requiredDevDeps ?? []),
		]) {
			enqueue(dep);
		}
	}

	return Array.from(resolved.values());
};
