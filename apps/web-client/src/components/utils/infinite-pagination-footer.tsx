"use client";

import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { Switch } from "@repo/ui/components/ui/switch";
import { cn } from "@repo/ui/lib/utils";
import { RefreshCw } from "@repo/ui/lucide";
import { useEffect, useRef, useState } from "react";

export type InfinitePaginationVariant = "default" | "compact" | "ghost";
export type LoadMoreTrigger = "button" | "view";

export interface InfiniteQueryLike<T = unknown> {
	data?: T[];
	pagination?: { total: number; totalPages: number; currentPage: number; pageSize: number };
	hasNextPage?: boolean;
	isFetchingNextPage?: boolean;
	fetchNextPage: () => unknown;
	isRefetching?: boolean;
	refetch?: () => unknown;
}

export interface InfinitePaginationFooterProps<T = unknown> {
	query: InfiniteQueryLike<T>;

	loadMoreTrigger?: LoadMoreTrigger;
	loadMoreLabel?: string;
	endOfListLabel?: string;

	showRefreshButton?: boolean;
	showAutoRefresh?: boolean;
	autoRefresh?: boolean;
	defaultAutoRefresh?: boolean;
	onAutoRefreshChange?: (value: boolean) => void;
	refreshInterval?: number;

	variant?: InfinitePaginationVariant;
	className?: string;
}

function InfinitePaginationFooter<T>({
	query,
	loadMoreTrigger = "button",
	loadMoreLabel = "Load more",
	endOfListLabel = "You're all caught up",
	showRefreshButton = true,
	showAutoRefresh = true,
	autoRefresh: controlledAutoRefresh,
	defaultAutoRefresh = false,
	onAutoRefreshChange,
	refreshInterval = 30_000,
	variant = "default",
	className,
}: InfinitePaginationFooterProps<T>) {
	const { data, pagination, hasNextPage, isFetchingNextPage, fetchNextPage, isRefetching, refetch } = query;

	const [uncontrolledAutoRefresh, setUncontrolledAutoRefresh] = useState(defaultAutoRefresh);
	const autoRefresh = controlledAutoRefresh ?? uncontrolledAutoRefresh;

	const setAutoRefresh = (value: boolean) => {
		if (controlledAutoRefresh === undefined) setUncontrolledAutoRefresh(value);
		onAutoRefreshChange?.(value);
	};

	useEffect(() => {
		if (!autoRefresh || !refetch) return;

		const id = setInterval(() => refetch(), refreshInterval);
		return () => clearInterval(id);
	}, [autoRefresh, refetch, refreshInterval]);

	const sentinelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (loadMoreTrigger !== "view") return;
		const node = sentinelRef.current;
		if (!node) return;

		const observer = new IntersectionObserver(
			entries => {
				if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
					fetchNextPage();
				}
			},
			{ rootMargin: "200px" }
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, [loadMoreTrigger, hasNextPage, isFetchingNextPage, fetchNextPage]);

	const total = pagination?.total ?? 0;
	const count = data?.length ?? 0;
	const showRefreshControls = Boolean(refetch) && (showAutoRefresh || showRefreshButton);

	return (
		<div
			className={cn(
				"flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-between",
				variant === "default" && "rounded-xl border bg-background/50 p-3 shadow-sm backdrop-blur-sm",
				variant === "compact" && "rounded-lg border border-transparent py-1",
				variant === "ghost" && "py-2",
				className
			)}
		>
			<div className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
				{total > 0 ? `Loaded ${count} of ${total}` : `Loaded ${count}`}
			</div>

			<div className="flex items-center gap-4">
				{showRefreshControls ? (
					<div className="flex items-center gap-2">
						{showAutoRefresh ? (
							<>
								<Switch
									id="infinite-pagination-auto-refresh"
									checked={autoRefresh}
									onCheckedChange={setAutoRefresh}
									size="sm"
								/>
								<label
									htmlFor="infinite-pagination-auto-refresh"
									className="cursor-pointer text-xs font-medium whitespace-nowrap text-muted-foreground select-none"
								>
									Auto-refresh
								</label>
							</>
						) : null}
						{showRefreshButton ? (
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Refresh"
								onClick={() => refetch?.()}
								disabled={isRefetching}
							>
								<RefreshCw className={cn("size-4", isRefetching && "animate-spin")} />
							</Button>
						) : null}
					</div>
				) : null}

				{hasNextPage ? (
					loadMoreTrigger === "view" ? (
						<div ref={sentinelRef} className="flex items-center justify-center px-2" aria-hidden="true">
							<Spinner className={cn("size-4 opacity-0", isFetchingNextPage && "opacity-100")} />
						</div>
					) : (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => fetchNextPage()}
							disabled={isFetchingNextPage}
						>
							{isFetchingNextPage ? <Spinner className="size-3.5" /> : null}
							{loadMoreLabel}
						</Button>
					)
				) : count > 0 ? (
					<span className="text-xs whitespace-nowrap text-muted-foreground">{endOfListLabel}</span>
				) : null}
			</div>
		</div>
	);
}

export default InfinitePaginationFooter;
