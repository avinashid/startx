import { Loader, Scroll } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

type NoContentProps = {
	icon?: ReactNode;
	label?: string;
	className?: string;
	loading?: boolean;
};
export const NoContent = (props: NoContentProps) => {
	if (props.loading) {
		return (
			<div
				className={cn(
					'h-full w-full flex flex-col gap-2 justify-center items-center',
					props.className ?? '',
				)}
			>
				<Loader className="animate-spin" />
				<p className="text-sm text-muted-foreground">loading</p>
			</div>
		);
	}
	return (
		<div
			className={cn(
				'h-full w-full flex text-sm flex-col gap-2 justify-center items-center',
				props.className ?? '',
			)}
		>
			{props.icon ?? <Scroll />}
			<p className=" text-muted-foreground">{props.label ?? 'No Content'}</p>
		</div>
	);
};
