import { cn } from '../lib/utils';

export type GridProps = {
	children: React.ReactNode;
	grow?: boolean;
	className?: string;
};

const Grid = (props: GridProps) => {
	return (
		<div
			className={cn(
				'grid sm:grid-cols-12 gap-2 grid-cols-1',
				props.grow ? 'min-h-[calc(100vh-60px)] py-2' : '',
				props.className,
			)}
		>
			{props.children}
		</div>
	);
};

export { Grid };
