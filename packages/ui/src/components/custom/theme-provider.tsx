import * as React from "react";
import { Toaster } from "../ui/sonner";

export type Mode = "dark" | "light" | "system";
export type ThemeColor =
	| "default"
	| "orange"
	| "purple"
	| "emerald"
	| "rose"
	| "amber"
	| "brick"
	| "rust"
	| "cyan"
	| "indigo"
	| "blue";

export const themes: Record<ThemeColor, string> = {
	default: "default",
	orange: "orange",
	purple: "purple",
	emerald: "emerald",
	rose: "rose",
	amber: "amber",
	brick: "brick",
	rust: "rust",
	cyan: "cyan",
	indigo: "indigo",
	blue: "blue",
};

type ThemeProviderProps = {
	children: React.ReactNode;
	defaultMode?: Mode;
	defaultColor?: ThemeColor;
	storageKeyPrefix?: string;
};

type ThemeProviderState = {
	mode: Mode;
	setMode: (mode: Mode) => void;
	color: ThemeColor;
	setColor: (color: ThemeColor) => void;
};

const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({
	children,
	defaultMode = "system",
	defaultColor = "default",
	storageKeyPrefix = "app-theme",
	...props
}: ThemeProviderProps) {
	const modeKey = `${storageKeyPrefix}-mode`;
	const colorKey = `${storageKeyPrefix}-color`;

	// --- State ---
	const [mode, setModeState] = React.useState<Mode>(() => (localStorage.getItem(modeKey) as Mode) || defaultMode);

	const [color, setColorState] = React.useState<ThemeColor>(
		() => (localStorage.getItem(colorKey) as ThemeColor) || defaultColor
	);

	// --- Actions ---
	const setMode = React.useCallback(
		(newMode: Mode) => {
			if (!document.startViewTransition) {
				localStorage.setItem(modeKey, newMode);
				setModeState(newMode);
				return;
			}

			document.startViewTransition(() => {
				localStorage.setItem(modeKey, newMode);
				setModeState(newMode);
			});
		},
		[modeKey]
	);

	const setColor = React.useCallback(
		(newColor: ThemeColor) => {
			if (!document.startViewTransition) {
				localStorage.setItem(colorKey, newColor);
				setColorState(newColor);
				return;
			}

			document.startViewTransition(() => {
				localStorage.setItem(colorKey, newColor);
				setColorState(newColor);
			});
		},
		[colorKey]
	);

	// --- Apply Mode (Light/Dark) ---
	React.useEffect(() => {
		const root = document.documentElement;
		root.classList.remove("light", "dark");

		if (mode === "system") {
			const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
			root.classList.add(systemTheme);
			return;
		}

		root.classList.add(mode);
	}, [mode]);

	// --- Apply Color Scheme ---
	React.useEffect(() => {
		const root = document.documentElement;
		if (color === "default") {
			root.removeAttribute("data-theme");
		} else {
			root.setAttribute("data-theme", color);
		}
	}, [color]);

	// --- System Mode Listener ---
	React.useEffect(() => {
		if (mode !== "system") return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleChange = () => setModeState("system");

		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, [mode]);

	const value = React.useMemo(() => ({ mode, setMode, color, setColor }), [mode, color, setMode, setColor]);

	return (
		<ThemeProviderContext.Provider {...props} value={value}>
			<Toaster richColors />
			{children}
		</ThemeProviderContext.Provider>
	);
}

export const useTheme = () => {
	const context = React.useContext(ThemeProviderContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
};
