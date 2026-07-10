import type { IPaginatedData } from "@repo/ui/api/use-api/api-types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/components/ui/select";
import { cn } from "@repo/ui/lib/utils";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "@repo/ui/lucide";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import React, { forwardRef, useMemo, type ButtonHTMLAttributes } from "react";
import usePagination from "~/hooks/pagination/use-pagination";

export type PaginationVariant = "default" | "compact" | "ghost";

interface PaginationSectionProps<T> {
	pagination?: IPaginatedData<T>["pagination"];
	pageKey?: string;
	limitKey?: string;
	limit?: number;
	variant?: PaginationVariant;
	className?: string;
}

const emptyPagination: IPaginatedData<unknown>["pagination"] = {
	total: 0,
	totalPages: 0,
	currentPage: 0,
	pageSize: 0,
};

const DEFAULT_LIMIT_LIST = [5, 10, 20, 30, 40, 50];

const SPRING_TRANSITION = {
	type: "spring",
	stiffness: 500,
	damping: 30,
	mass: 1,
} as const;

interface PaginationNavButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	icon: React.ElementType;
	label: string;
	isHiddenOnMobile?: boolean;
}

const PaginationNavButton = forwardRef<HTMLButtonElement, PaginationNavButtonProps>(
	({ icon: Icon, label, disabled, isHiddenOnMobile, onClick, ...props }, ref) => {
		const shouldReduceMotion = useReducedMotion();

		return (
			<motion.button
				ref={ref}
				aria-label={label}
				aria-disabled={disabled}
				disabled={disabled}
				onClick={onClick}
				whileHover={!disabled && !shouldReduceMotion ? { scale: 1.05 } : undefined}
				whileTap={!disabled && !shouldReduceMotion ? { scale: 0.95 } : undefined}
				transition={SPRING_TRANSITION}
				className={cn(
					"relative flex h-9 w-9 md:h-8 md:w-8 items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground outline-none transition-colors",
					"focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
					"hover:bg-secondary/80 hover:text-foreground",
					"disabled:pointer-events-none disabled:opacity-40",
					isHiddenOnMobile && "hidden sm:flex",
					props.className
				)}
			>
				<Icon className="h-4 w-4" aria-hidden="true" />
			</motion.button>
		);
	}
);
PaginationNavButton.displayName = "PaginationNavButton";

function PaginationFooter<T>({
	pagination,
	pageKey,
	limitKey,
	limit,
	variant = "default",
	className,
}: PaginationSectionProps<T>) {
	const prefersReducedMotion = useReducedMotion();
	const { next, prev, setLimit, setPage } = usePagination({
		pageKey,
		limitKey,
		limit,
	});

	const data = pagination || emptyPagination;

	const limitList = useMemo(() => {
		const list = [...DEFAULT_LIMIT_LIST];
		if (data.pageSize > 0 && !list.includes(data.pageSize)) {
			list.push(data.pageSize);
			list.sort((a, b) => a - b);
		}
		return list;
	}, [data.pageSize]);

	if (data.total === 0) return null;

	const isFirstPage = data.currentPage <= 1;
	const isLastPage = data.currentPage >= data.totalPages;

	return (
		<nav
			aria-label="Pagination Navigation"
			className={cn(
				"flex w-full flex-col-reverse items-center justify-between gap-4 sm:flex-row",
				variant === "default" && "rounded-xl border bg-background/50 p-2 shadow-sm backdrop-blur-sm",
				variant === "compact" && "rounded-lg border border-transparent py-1",
				variant === "ghost" && "py-2",
				className
			)}
		>
			<div className="flex w-full items-center justify-between sm:w-auto sm:justify-start gap-4">
				<div className="flex items-center gap-2">
					<label
						htmlFor="rows-per-page-select"
						className={cn(
							"whitespace-nowrap font-medium text-muted-foreground",
							variant === "compact" ? "text-xs" : "text-sm"
						)}
					>
						Rows per page
					</label>
					<Select value={`${data.pageSize}`} onValueChange={value => setLimit(parseInt(value, 10))}>
						<SelectTrigger
							id="rows-per-page-select"
							className={cn(
								"h-8 w-[72px] transition-colors hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring/50",
								variant === "compact" && "h-7 text-xs"
							)}
						>
							<SelectValue placeholder={`${data.pageSize}`} />
						</SelectTrigger>
						<SelectContent side="top" className="min-w-[72px]">
							{limitList.map(pageSize => (
								<SelectItem key={pageSize} value={`${pageSize}`} className="cursor-pointer transition-colors">
									{pageSize}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="flex w-full items-center justify-between sm:w-auto gap-4 sm:gap-6">
				<div
					className={cn(
						"flex flex-1 items-center justify-center font-medium tabular-nums text-muted-foreground sm:justify-end",
						variant === "compact" ? "text-xs" : "text-sm"
					)}
					aria-live="polite"
				>
					<span className="mr-1">Page</span>
					<div className="relative flex min-w-[1ch] items-center justify-center overflow-hidden">
						<AnimatePresence mode="popLayout" initial={false}>
							<motion.span
								key={data.currentPage}
								initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(4px)" }}
								animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
								exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, filter: "blur(4px)" }}
								transition={SPRING_TRANSITION}
								className="inline-block text-foreground"
							>
								{data.currentPage}
							</motion.span>
						</AnimatePresence>
					</div>
					<span className="ml-1">of {data.totalPages}</span>
				</div>

				<div className="flex items-center gap-1 sm:gap-1.5">
					<PaginationNavButton
						icon={ChevronFirst}
						label="Go to first page"
						onClick={() => setPage(1)}
						disabled={isFirstPage}
						isHiddenOnMobile
					/>
					<PaginationNavButton
						icon={ChevronLeft}
						label="Go to previous page"
						onClick={() => prev()}
						disabled={isFirstPage}
					/>
					<PaginationNavButton
						icon={ChevronRight}
						label="Go to next page"
						onClick={() => next()}
						disabled={isLastPage}
					/>
					<PaginationNavButton
						icon={ChevronLast}
						label="Go to last page"
						onClick={() => setPage(data.totalPages)}
						disabled={isLastPage}
						isHiddenOnMobile
					/>
				</div>
			</div>
		</nav>
	);
}

export default PaginationFooter;
