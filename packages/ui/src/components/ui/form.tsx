import { CircleAlert } from "lucide-react";
import * as React from "react";
import type { ControllerProps, FieldPath, FieldValues } from "react-hook-form";
import { Controller, FormProvider, useFormContext } from "react-hook-form";
import type { ClassNameValue } from "tailwind-merge";

import { cn } from "@repo/ui/lib/utils";
import { Label } from "./label";

const Form = FormProvider;

type FormFieldContextValue<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
	name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue);

const FormField = <
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
	...props
}: ControllerProps<TFieldValues, TName>) => {
	return (
		<FormFieldContext.Provider value={{ name: props.name }}>
			<Controller {...props} />
		</FormFieldContext.Provider>
	);
};

const useFormField = () => {
	const fieldContext = React.useContext(FormFieldContext);
	const itemContext = React.useContext(FormItemContext);
	const { getFieldState, formState } = useFormContext();

	const fieldState = getFieldState(fieldContext.name, formState);

	if (!fieldContext) {
		throw new Error("useFormField should be used within <FormField>");
	}

	const { id } = itemContext;

	return {
		id,
		name: fieldContext.name,
		formItemId: `${id}-form-item`,
		formDescriptionId: `${id}-form-item-description`,
		formMessageId: `${id}-form-item-message`,
		...fieldState,
	};
};

type FormItemContextValue = {
	id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => {
		const id = React.useId();

		return (
			<FormItemContext.Provider value={{ id }}>
				<div ref={ref} className={cn("space-y-2", className)} {...props} />
			</FormItemContext.Provider>
		);
	}
);
FormItem.displayName = "FormItem";

const FormLabel = React.forwardRef<
	React.ElementRef<typeof Label>,
	React.ComponentPropsWithoutRef<typeof Label> & {
		className?: ClassNameValue;
	}
>(({ className, ...props }, ref) => {
	const { error, formItemId } = useFormField();

	return <Label ref={ref} className={cn(error && "text-destructive", className)} htmlFor={formItemId} {...props} />;
});
FormLabel.displayName = "FormLabel";

const FormDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
	({ className, ...props }, ref) => {
		const { formDescriptionId } = useFormField();

		return <p ref={ref} id={formDescriptionId} className={cn("text-sm text-muted-foreground", className)} {...props} />;
	}
);
FormDescription.displayName = "FormDescription";

const FormMessage = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
	({ className, children, ...props }, ref) => {
		const { error, formMessageId } = useFormField();
		const body = error ? String(error?.message) : children;

		if (!body) {
			return null;
		}

		return (
			<span
				ref={ref}
				id={formMessageId}
				className={cn("text-sm flex gap-2 items-center font-medium text-destructive", className)}
				{...props}
			>
				<CircleAlert size={18} strokeWidth={2} />
				<p>{body}</p>
			</span>
		);
	}
);
FormMessage.displayName = "FormMessage";
const FormControl = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }>(
	({ className, children, ...props }, ref) => {
		if (!React.isValidElement(children)) {
			return <>{children}</>;
		}

		const child = children as React.ReactElement<React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>>;

		return React.cloneElement(child, {
			...props,
			...child.props,
			ref: (node: HTMLElement) => {
				const childRef = (child as any)?.ref ?? child?.props?.ref;

				if (typeof childRef === "function") {
					childRef(node);
				} else if (childRef && "current" in childRef) {
					(childRef as React.MutableRefObject<HTMLElement | null>).current = node;
				}

				if (typeof ref === "function") {
					ref(node);
				} else if (ref && "current" in ref) {
					(ref as React.MutableRefObject<HTMLElement | null>).current = node;
				}
			},
			className: cn("w-full", className, child.props.className),
		});
	}
);

FormControl.displayName = "FormControl";

export { useFormField, Form, FormItem, FormLabel, FormDescription, FormMessage, FormField };
