import type React from 'react';

import { cn } from '@repo/ui/lib/utils';
interface TypographyProps {
	children: React.ReactNode; // Text content to display
	className?: string; // Additional class names for styling
}

const H1: React.FC<TypographyProps> = ({ children, className }) => (
	<h1 className={cn('text-4xl font-bold', className)}>{children}</h1>
);

const H2: React.FC<TypographyProps> = ({ children, className }) => (
	<h2 className={cn('text-3xl font-semibold', className)}>{children}</h2>
);

const H3: React.FC<TypographyProps> = ({ children, className }) => (
	<h3 className={cn('text-2xl font-medium', className)}>{children}</h3>
);

const H4: React.FC<TypographyProps> = ({ children, className }) => (
	<h4 className={cn('text-xl font-semibold', className)}>{children}</h4>
);

const H5: React.FC<TypographyProps> = ({ children, className }) => (
	<h5 className={cn('text-lg font-medium', className)}>{children}</h5>
);

const H6: React.FC<TypographyProps> = ({ children, className }) => (
	<h6 className={cn('font-semibold', className)}>{children}</h6>
);

const Default: React.FC<TypographyProps> = ({ children, className }) => (
	<p className={cn(className)}>{children}</p>
);

const Secondary: React.FC<TypographyProps> = ({ children, className }) => (
	<span className={cn('text-muted-foreground', className)}>{children}</span>
);

const Primary: React.FC<TypographyProps> = ({ children, className }) => (
	<span className={cn('text-primary', className)}>{children}</span>
);

const Error: React.FC<TypographyProps> = ({ children, className }) => (
	<span className={cn('text-destructive text-sm', className)}>{children}</span>
);

const Warning: React.FC<TypographyProps> = ({ children, className }) => (
	<span className={cn('text-yellow-500 text-sm', className)}>{children}</span>
);

const Success: React.FC<TypographyProps> = ({ children, className }) => (
	<span className={cn('text-green-500 text-sm', className)}>{children}</span>
);

const Hint: React.FC<TypographyProps> = ({ children, className }) => (
	<span className={cn('text-muted-foreground text-xs', className)}>{children}</span>
);

const Grayed: React.FC<TypographyProps> = ({ children, className }) => (
	<p className={cn('text-gray-500', className)}>{children}</p>
);

const Muted: React.FC<TypographyProps> = ({ children, className }) => (
	<p className={cn('text-muted', className)}>{children}</p>
);

const Key: React.FC<TypographyProps> = ({ children, className }) => (
	<span className={cn('font-thin text-xs', className)}>{children}</span>
);

const Value: React.FC<TypographyProps> = ({ children, className }) => (
	<span className={cn('text-lg', className)}>{children}</span>
);

const List: React.FC<TypographyProps & { label?: string }> = ({ children, className, label }) => (
	<ul className={cn(className)}>
		{label && <span className="font-semibold">{label}</span>}
		{children}
	</ul>
);
const Item: React.FC<TypographyProps> = ({ children, className }) => (
	<li className={cn('ml-6 text-sm list-disc', className)}>{children}</li>
);

// Combine all typography components into a single object
const Tp = {
	h1: H1,
	h2: H2,
	h3: H3,
	h4: H4,
	h5: H5,
	h6: H6,
	default: Default,
	secondary: Secondary,
	error: Error,
	warning: Warning,
	success: Success,
	hint: Hint,
	grayed: Grayed,
	muted: Muted,
	key: Key,
	value: Value,
	list: List,
	item: Item,
	primary: Primary,
};

export { Tp };
