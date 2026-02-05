import type React from 'react';

export type SwitchCases<T extends string> = {
	[key in T]?: React.ReactNode; // Mapping of cases with the type T
};

export type SwitchProps<T extends string> = {
	value: T; // The value to match against the cases
	cases: SwitchCases<T>; // Cases object with keys as possible values of type T
	default?: React.ReactNode; // Default component if no case matches
};

function SwitchComponent<T extends string>(props: SwitchProps<T>) {
	const { value, cases, default: defaultCase } = props;

	// Render the component matching the value, or the default if none matches
	return <>{cases[value] ?? defaultCase ?? <div></div>}</>;
}

export { SwitchComponent };
