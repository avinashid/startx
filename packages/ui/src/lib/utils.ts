import { type ClassValue, clsx } from "clsx";
import {
	differenceInDays,
	differenceInYears,
	format,
	formatDistance,
	isThisWeek,
	isToday,
	isYesterday,
	parseISO,
} from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
export class FormUtils {
	static getFormData(object: Record<string, any>): FormData {
		const formData = new FormData();
		Object.entries(object).forEach(([key, value]) => {
			if (value === undefined || value === null) return;

			if (value instanceof Blob || value instanceof File) {
				formData.append(key, value);
			} else if (value instanceof FileList || (Array.isArray(value) && value[0] instanceof File)) {
				Array.from(value as File[]).forEach(file => formData.append(key, file));
			} else if (typeof value === "string") {
				formData.append(key, value);
			} else {
				formData.append(key, JSON.stringify(value));
			}
		});
		return formData;
	}
}

export class UrlUtils {
	static switchPath(pathname: string, tab: string): string {
		const fragments = pathname.split("/").filter(Boolean);
		fragments[2] = tab;
		return `/${fragments.join("/")}`;
	}

	static isValidUrl(url: string): boolean {
		try {
			return new URL(url).origin !== "null";
		} catch {
			return false;
		}
	}
}

export class DateUtils {
	static getRelativeDate(date?: string | Date, includeTime = true): string {
		if (!date) return "";
		const d = new Date(date);
		const now = new Date();

		if (isToday(d)) return includeTime ? format(d, "h:mm a") : "today";
		if (isYesterday(d)) return "yesterday";
		if (isThisWeek(d) && differenceInDays(now, d) <= 7) return format(d, "EEEE");

		return format(d, "dd/MM/yy");
	}

	static getRelativeDateWithTime(date?: string | Date): string {
		if (!date) return "";
		return formatDistance(new Date(date), new Date(), { addSuffix: true });
	}

	static getRelativeProDate(dateString: string): string {
		try {
			const date = parseISO(dateString);
			const formatStr = differenceInYears(new Date(), date) >= 1 ? "dd MMM yyyy, h:mm a" : "dd MMM, h:mm a";
			return format(date, formatStr);
		} catch (error) {
			console.error("Error formatting date:", error);
			return "";
		}
	}
}

export class FormatUtils {
	static numberWithKMB(num: number): string {
		return new Intl.NumberFormat("en-US", {
			notation: "compact",
			minimumSignificantDigits: 1,
			maximumSignificantDigits: 3,
		}).format(num);
	}

	static currencyToNumber(formattedCurrency: string): number {
		const numericString = formattedCurrency.replace(/[^0-9.-]+/g, "");
		const parsedNumber = Number.parseFloat(numericString);
		if (isNaN(parsedNumber)) throw new Error("Invalid currency format");
		return parsedNumber;
	}

	static createLabels(e: string): string {
		return e
			.replaceAll("_", " ")
			.replace(/\b\w/g, char => char.toUpperCase())
			.trim();
	}
}

export class ValidationUtils {
	static isValidId(str: string): boolean {
		return /^[a-f0-9]{24}$/i.test(str);
	}
}

export { cva, type VariantProps } from "class-variance-authority";
