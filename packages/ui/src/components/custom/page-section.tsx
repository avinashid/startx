import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils';
import { Separator } from '../ui/separator';
const pageSectionVariant = cva(
	'flex flex-col space-y-4 rounded-lg  bg-background/70 p-6 md:px-6 px-2 w-full h-full ',
	{
		variants: {
			variant: {
				default: '',
				outline: 'border',
				transparent: 'bg-transparent md:px-0 px-0',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);
type PageSectionProps = {
	icon?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	className?: string;
	children: ReactNode;
	separator?: boolean;
	suffixIcon?: ReactNode;
} & VariantProps<typeof pageSectionVariant>;

const PageSection = ({
	icon,
	title,
	description,
	className,
	children,
	separator,
	suffixIcon,
	...props
}: PageSectionProps) => {
	return (
		<section className={cn(pageSectionVariant({ variant: props.variant }), className)} {...props}>
			<div className="flex gap-1 flex-col">
				<div className="flex items-center gap-2">
					{icon && <div className="h-6 w-6 text-muted-foreground">{icon}</div>}

					<span className="text-lg font-semibold">{title}</span>
					<div className="ml-auto">{suffixIcon}</div>
				</div>
				<p className="text-sm text-muted-foreground">{description}</p>
				{separator && <Separator className="mt-1" />}
			</div>

			{children}
		</section>
	);
};

export { PageSection };
