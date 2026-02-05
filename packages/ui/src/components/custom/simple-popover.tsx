import type { ClassNameValue } from 'tailwind-merge';

import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { cn } from '../lib/utils';

interface SimplePopoverProps {
	children: React.ReactNode;
	trigger: React.ReactNode;
	side?: 'top' | 'right' | 'bottom' | 'left';
	sideOffset?: number;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	className?: ClassNameValue;
}

export const SimplePopover = (props: SimplePopoverProps) => {
	return (
		<Popover open={props.open} onOpenChange={props.onOpenChange}>
			<PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
			<PopoverContent
				side={props.side}
				sideOffset={props.sideOffset}
				className={cn(props.className)}
			>
				{props.children}
			</PopoverContent>
		</Popover>
	);
};
