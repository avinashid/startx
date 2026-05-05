import { format } from "date-fns";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	type ArrayPath,
	type Control,
	type ControllerProps,
	type FieldPath,
	type FieldValues,
	type UseFormReturn,
	useFieldArray,
} from "react-hook-form";
import type { ClassNameValue } from "tailwind-merge";

import { cn } from "@repo/ui/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { Form, FormField } from "../ui/form";
import { Input, type InputProps } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";

type SimpleFormFieldProps = {
	label?: ReactNode;
	description?: ReactNode;
};

type SelectOption = { label: string; value: string };
type RelationSelectOption = {
	label: string;
	options: Array<{
		label: string;
		value: string;
	}>;
};

type FormSelectFieldProps<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>> = Omit<
	ControllerProps<TFieldValues, TName>,
	"render"
> & {
	label?: ReactNode;
	options: Array<SelectOption | RelationSelectOption>;
	className?: ClassNameValue;
	placeholder?: ReactNode;
	onChange?: (value: string) => void;
	inputClassName?: ClassNameValue;
};

export const FormSelectField = <
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
	control,
	name,
	label,
	disabled,
	className,
	placeholder,
	onChange,
	defaultValue: defaultValueProp,
	inputClassName,
	options,
}: FormSelectFieldProps<TFieldValues, TName>) => {
	const transformOptions = ({
		options,
		defaultValue,
	}: {
		options: Array<SelectOption | RelationSelectOption>;
		defaultValue?: string;
	}): Array<SelectOption | RelationSelectOption> => {
		if (!defaultValue) return [...options];

		const valueExists = options.some(opt => {
			if ("options" in opt) {
				return opt.options.some(nestedOpt => nestedOpt.value === defaultValue);
			}
			return opt.value === defaultValue;
		});

		if (!valueExists) {
			return [{ label: defaultValue, value: defaultValue }, ...options];
		}

		return [...options];
	};

	return (
		<FormField
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field data-invalid={!!fieldState.error} className={cn("flex flex-col", className)}>
					{label ? <FieldLabel className="self-start">{label}</FieldLabel> : null}
					<FieldContent>
						<Select
							disabled={disabled}
							onValueChange={value => {
								field.onChange(value);
								onChange?.(value);
							}}
							value={field.value ?? defaultValueProp ?? ""}
						>
							<SelectTrigger className={cn("bg-background w-full", inputClassName)}>
								<SelectValue placeholder={placeholder ?? "Select"} />
							</SelectTrigger>
							<SelectContent>
								{transformOptions({ options, defaultValue: field.value }).map(option => {
									if ("options" in option) {
										return (
											<SelectGroup key={option.label}>
												<SelectLabel>{option.label}</SelectLabel>
												{option.options.map(option => (
													<SelectItem key={option.value} value={option.value}>
														{option.label}
													</SelectItem>
												))}
											</SelectGroup>
										);
									}
									return (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
					</FieldContent>
					<FieldError errors={[fieldState.error]} />
				</Field>
			)}
		/>
	);
};

export const FormTextField = <
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(
	props: Omit<
		SimpleFormFieldProps & ControllerProps<TFieldValues, TName> & InputProps & React.RefAttributes<HTMLInputElement>,
		"render"
	>
) => {
	const { label, description, control, name, ...rest } = props;

	return (
		<FormField
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field data-invalid={!!fieldState.error} className="flex flex-col">
					{label ? <FieldLabel className="self-start">{label}</FieldLabel> : null}
					<FieldContent>
						<Input {...field} {...rest} />
					</FieldContent>
					{description ? <FieldDescription>{description}</FieldDescription> : null}
					<FieldError errors={[fieldState.error]} />
				</Field>
			)}
		/>
	);
};

export const FormTextAreaField = <
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(
	props: Omit<
		SimpleFormFieldProps &
			ControllerProps<TFieldValues, TName> &
			React.TextareaHTMLAttributes<HTMLTextAreaElement> &
			React.RefAttributes<HTMLTextAreaElement>,
		"render"
	>
) => {
	const { label, description, control, name, ...rest } = props;

	return (
		<FormField
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field data-invalid={!!fieldState.error} className="flex flex-col">
					{label ? <FieldLabel className="self-start">{label}</FieldLabel> : null}
					<FieldContent>
						<Textarea {...field} {...rest} ref={field.ref} />
					</FieldContent>
					{description ? <FieldDescription>{description}</FieldDescription> : null}
					<FieldError errors={[fieldState.error]} />
				</Field>
			)}
		/>
	);
};

export const FormNumberField = <
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(
	props: Omit<
		SimpleFormFieldProps & ControllerProps<TFieldValues, TName> & InputProps & React.RefAttributes<HTMLInputElement>,
		"render"
	>
) => {
	const { label, description, control, name, ...rest } = props;

	return (
		<FormField
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field data-invalid={!!fieldState.error} className="flex flex-col">
					{label ? <FieldLabel className="self-start">{label}</FieldLabel> : null}
					<FieldContent>
						<Input
							inputMode="numeric"
							{...field}
							onChange={e => {
								if (!isNaN(Number(e.currentTarget.value))) field.onChange(Number(e.currentTarget.value));
							}}
							{...rest}
						/>
					</FieldContent>
					{description ? <FieldDescription>{description}</FieldDescription> : null}
					<FieldError errors={[fieldState.error]} />
				</Field>
			)}
		/>
	);
};

export type FormWrapperProps<T extends FieldValues> = {
	onSubmit: (data: T) => void;
	formData: UseFormReturn<T, unknown, any>;
	children: React.ReactNode;
	className?: string;
};
type MultipleFormItemProps<TFieldValues extends FieldValues, TName extends ArrayPath<TFieldValues>> = {
	control: Control<TFieldValues>;
	name: TName;
	label?: string;
	addMoreBtn?: ReactNode;
	className?: ClassNameValue;
	wrapperClassName?: ClassNameValue;
	children: (field: { id: string; index: number; remove: () => void }) => ReactNode;
	defaultValue: TFieldValues[TName] extends Array<infer U> ? U : never;
};
export const MultipleFormItem = <TFieldValues extends FieldValues, TName extends ArrayPath<TFieldValues>>({
	control,
	name,
	addMoreBtn,
	children,
	label,
	wrapperClassName,
	className,
	defaultValue,
}: MultipleFormItemProps<TFieldValues, TName>) => {
	const { fields, append, remove } = useFieldArray({
		control,
		name,
	});

	return (
		<div className="multiple-form-item">
			{label ? <p className="mt-6 text-sm">{label}</p> : null}
			<div className={cn(wrapperClassName)}>
				{fields.map((field, index) => (
					<div key={field.id} className={cn("flex flex-col gap-2 max-w-xl", className)}>
						{children({ id: field.id, index, remove: () => remove(index) })}
					</div>
				))}
				{addMoreBtn ? (
					<Button onClick={() => append(defaultValue as any)}>{addMoreBtn}</Button>
				) : (
					<Button
						className="w-1/3 mt-4 flex gap-1"
						variant="outline"
						type="button"
						size={"sm"}
						onClick={() => append(defaultValue as any)}
					>
						<Plus />
						<span>Add {label?.toLowerCase() ?? "item"}</span>
					</Button>
				)}
			</div>
		</div>
	);
};
export function FormWrapper<T extends FieldValues>(props: FormWrapperProps<T>) {
	return (
		<Form {...props.formData}>
			<form
				className={cn("flex flex-col gap-4", props.className)}
				onSubmit={async e => {
					e.preventDefault();
					e.stopPropagation();
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					await props.formData.handleSubmit(data => props.onSubmit(data))();
				}}
			>
				{props.children}
			</form>
		</Form>
	);
}

export const FormDefaultDateField = <
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(
	props: Omit<
		SimpleFormFieldProps & ControllerProps<TFieldValues, TName> & InputProps & React.RefAttributes<HTMLInputElement>,
		"render"
	>
) => {
	const { label, description, control, name, ...rest } = props;

	const safeFormat = (date: Date | string | undefined | null) => {
		try {
			if (!date) return undefined;

			const parsedDate = typeof date === "string" ? new Date(date) : date;

			const year = parsedDate.getUTCFullYear();
			const month = parsedDate.getUTCMonth();
			const day = parsedDate.getUTCDate();

			const utcMidnight = new Date(Date.UTC(year, month, day));
			return format(utcMidnight, "yyyy-MM-dd");
		} catch (error) {
			return undefined;
		}
	};

	const safeParse = (dateString: string | undefined | null) => {
		try {
			if (!dateString) return undefined;

			const localDate = new Date(dateString);

			const year = localDate.getFullYear();
			const month = localDate.getMonth();
			const day = localDate.getDate();

			return new Date(Date.UTC(year, month, day));
		} catch (error) {
			console.error(error);
			return undefined;
		}
	};

	return (
		<FormField
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field data-invalid={!!fieldState.error} className="flex flex-col">
					{label ? <FieldLabel className="self-start">{label}</FieldLabel> : null}
					<FieldContent>
						<Input
							{...field}
							{...rest}
							value={field.value || ""}
							onChange={e => field.onChange(e.target.value)}
							type="date"
							max="9999-12-31"
						/>
					</FieldContent>
					{description ? <FieldDescription>{description}</FieldDescription> : null}
					<FieldError errors={[fieldState.error]} />
				</Field>
			)}
		/>
	);
};

type FormMultiSelectFieldProps<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>> = Omit<
	ControllerProps<TFieldValues, TName>,
	"render"
> & {
	label?: React.ReactNode;
	options: Array<SelectOption | RelationSelectOption>;
	className?: string;
	placeholder?: React.ReactNode;
	onChange?: (value: string[]) => void;
	inputClassName?: string;
	showSelected?: boolean;
};

export function FormMultiSelectField<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
	control,
	name,
	label,
	className,
	placeholder,
	showSelected = true,
	onChange,
	defaultValue,
	inputClassName,
	disabled,
	options,
}: FormMultiSelectFieldProps<TFieldValues, TName>) {
	const [open, setOpen] = useState(false);

	return (
		<FormField
			control={control}
			name={name}
			defaultValue={defaultValue}
			render={({ field, fieldState }) => {
				const selected: string[] = field.value ?? [];

				const toggleOption = (value: string) => {
					const newValue = selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value];
					field.onChange(newValue);
					onChange?.(newValue);
				};

				return (
					<Field data-invalid={!!fieldState.error} className={cn("flex flex-col", className)}>
						{label ? <FieldLabel>{label}</FieldLabel> : null}
						<FieldContent className="w-full">
							<Popover open={open} onOpenChange={setOpen}>
								<PopoverTrigger asChild disabled={disabled}>
									<Button variant="outline" size={"sm"} className={cn("w-full justify-between", inputClassName)}>
										{selected.length > 0 ? `${selected.length} selected` : (placeholder ?? "Select")}
										<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
									</Button>
								</PopoverTrigger>
								<div className="w-full">
									<PopoverContent className="max-w-full min-w-full p-0">
										<Command className="w-full">
											<CommandInput placeholder="Search..." />
											<CommandList>
												<CommandEmpty>No options found.</CommandEmpty>
												{options.map(opt =>
													"options" in opt ? (
														<CommandGroup key={opt.label} heading={opt.label}>
															{opt.options.map(nested => (
																<CommandItem key={nested.value} onSelect={() => toggleOption(nested.value)}>
																	<Check
																		className={cn(
																			"mr-2 h-4 w-4",
																			selected.includes(nested.value) ? "opacity-100" : "opacity-0"
																		)}
																	/>
																	{nested.label}
																</CommandItem>
															))}
														</CommandGroup>
													) : (
														<CommandItem key={opt.value} onSelect={() => toggleOption(opt.value)}>
															<Check
																className={cn(
																	"mr-2 h-4 w-4",
																	selected.includes(opt.value) ? "opacity-100" : "opacity-0"
																)}
															/>
															{opt.label}
														</CommandItem>
													)
												)}
											</CommandList>
										</Command>
									</PopoverContent>
								</div>
							</Popover>
						</FieldContent>
						<FieldError errors={[fieldState.error]} />

						{showSelected && selected.length > 0 ? (
							<div className="flex flex-wrap gap-2 mt-2">
								{selected.map(value => {
									const badgeLabel =
										options.flatMap(o => ("options" in o ? o.options : o)).find(o => o.value === value)?.label ?? value;
									return (
										<Badge
											onClick={() => !disabled && toggleOption(value)}
											key={value}
											aria-disabled={disabled}
											variant="secondary"
											className={cn("px-2 py-1", !disabled && "cursor-pointer")}
										>
											{badgeLabel}
											{!disabled && <X className="ml-1 h-3 w-3 cursor-pointer" />}
										</Badge>
									);
								})}
							</div>
						) : null}
					</Field>
				);
			}}
		/>
	);
}
