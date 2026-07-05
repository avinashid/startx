import { cn } from "@repo/ui/lib/utils";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import * as React from "react";
import { useNavigation } from "react-router";

type LoaderState = "idle" | "loading" | "complete";

export function NavigationLoader({ className }: { className?: string }) {
	const navigation = useNavigation();
	const prefersReducedMotion = useReducedMotion();
	const [loaderState, setLoaderState] = React.useState<LoaderState>("idle");

	const stateRef = React.useRef<LoaderState>(loaderState);
	stateRef.current = loaderState;

	React.useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;

		const isNavigating = navigation.state === "loading" || navigation.state === "submitting";

		if (isNavigating) {
			if (stateRef.current === "idle") {
				timer = setTimeout(() => {
					setLoaderState("loading");
				}, 150);
			}
		} else if (navigation.state === "idle") {
			if (stateRef.current === "loading") {
				setLoaderState("complete");
				timer = setTimeout(() => {
					setLoaderState("idle");
				}, 500);
			} else {
				setLoaderState("idle");
			}
		}

		return () => clearTimeout(timer);
	}, [navigation.state]);

	if (prefersReducedMotion) {
		return null;
	}

	const progressVariants = {
		idle: {
			scaleX: 0,
			opacity: 0,
			transition: { duration: 0 },
		},
		loading: {
			scaleX: 0.85,
			opacity: 1,
			transition: {
				duration: 3.5,
				ease: [0.08, 0.82, 0.17, 1],
			},
		},
		complete: {
			scaleX: 1,
			opacity: 0,
			transition: {
				scaleX: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
				opacity: { duration: 0.3, delay: 0.1, ease: "linear" },
			},
		},
	} as const;

	return (
		<AnimatePresence>
			{loaderState !== "idle" && (
				<div
					role="progressbar"
					aria-hidden={loaderState === "complete"}
					aria-valuemin={0}
					aria-valuemax={100}
					className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px] w-full bg-transparent"
				>
					<motion.div
						className={cn("relative h-full w-full origin-left bg-primary/50", className)}
						initial="idle"
						animate={loaderState}
						exit="idle"
						variants={progressVariants}
						style={{ willChange: "transform, opacity" }}
					>
						<motion.div
							className="absolute inset-0 w-full bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/30"
							initial={{ x: "-100%" }}
							animate={{ x: "100%" }}
							transition={{
								repeat: Infinity,
								duration: 1.2,
								ease: "linear",
							}}
						/>

						<div className="absolute right-0 top-0 h-full w-64 bg-gradient-to-r from-transparent to-primary opacity-100" />

						<div className="absolute right-0 top-1/2 h-[5px] w-[15px] -translate-y-1/2 rounded-full bg-primary shadow-[0_0_12px_4px_hsl(var(--primary))]" />
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
