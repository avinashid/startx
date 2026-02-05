import { type AllHTMLAttributes, forwardRef } from 'react';

const PageContainer = forwardRef<HTMLButtonElement, AllHTMLAttributes<HTMLDivElement>>(
	(
		{
			className,

			...props
		},
		ref,
	) => {
		return (
			<main
				ref={ref}
				{...props}
				className={` px-4 py-4 gap-8 xs:px-8  md:px-16 lg:px-32  max-w-screen-2xl m-auto ${className} `}
			>
				<>{props.children}</>
			</main>
		);
	},
);
PageContainer.displayName = 'PageContainer';
export { PageContainer };
