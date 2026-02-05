/* eslint-disable @typescript-eslint/no-explicit-any */
import { type ClassValue, clsx } from 'clsx';
import {
	format,
	isToday,
	isYesterday,
	isThisWeek,
	differenceInDays,
	formatDistance,
	parseISO,
	differenceInYears,
} from 'date-fns';
import { twMerge } from 'tailwind-merge';

import type { Store } from '../util/storage';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// function isFileArray(value: any): value is File[] {
//   return Array.isArray(value) && value.every(item => item instanceof File);
// }

export function getFormData(object: {
	[key: string]: undefined | string | number | boolean | Blob | File | object | File[];
}): FormData {
	const formData = new FormData();
	Object.entries(object).forEach(([key, value]) => {
		if (value instanceof Blob || value instanceof File) {
			formData.append(key, value);
		} else if (value instanceof FileList || (Array.isArray(value) && value[0] instanceof File)) {
			Array.from(value).forEach((file: File) => {
				formData.append(key, file);
			});
		} else {
			if (!value) return;
			formData.append(key, JSON.stringify(value));
		}
	});
	return formData;
}

export function switchPath(pathname: string, tab: string) {
	const fragments = pathname.split('/').filter((str) => str);
	fragments[2] = tab;
	const path = `/${fragments.join('/')}`;
	return path;
}

export function getRelativeDate(date?: string | Date) {
	const now = new Date();
	if (!date) return '';
	if (isToday(date)) {
		return format(date, 'h:mm a');
	} else if (isYesterday(date)) {
		return 'yesterday';
	} else if (isThisWeek(date) && differenceInDays(now, date) <= 7) {
		return format(date, 'EEEE'); // EEEE gives the full name of the day like Sunday, Monday
	} else {
		return format(date, 'dd/MM/yy');
	}
}

export function getRelativeDateWithTime(date?: string | Date) {
	const now = new Date();
	if (!date) return '';
	return formatDistance(new Date(date), now, { addSuffix: true });
}

export function getRelativeProDate(dateString: string) {
	try {
		const date = parseISO(dateString);
		const now = new Date();
		const yearsDifference = differenceInYears(now, date);
		const dateFormat = yearsDifference >= 1 ? 'dd MMM yyyy, h:mm a' : 'dd MMM, h:mm a';
		const formattedDate = format(date, dateFormat);
		return formattedDate;
	} catch (error) {
		console.error('Error formatting date:', error);
		return '';
	}
}
export function isValidId(str: string) {
	const regex = /^[a-f0-9]{24}$/i;
	return regex.test(str);
}

export function getRelativeDateOnly(date?: string | Date) {
	const now = new Date();
	if (!date) return '';
	if (isToday(date)) {
		return 'today';
	} else if (isYesterday(date)) {
		return 'yesterday';
	} else if (isThisWeek(date) && differenceInDays(now, date) <= 7) {
		return format(date, 'EEEE'); // EEEE gives the full name of the day like Sunday, Monday
	} else {
		return format(date, 'dd/MM/yy');
	}
}
export type SocialMediaUrlMetaData = {
	platform: 'youtube' | 'x' | 'instagram';
	url: string;
	contentId: string;
};
export function getUrlMetaData(urlString: string): SocialMediaUrlMetaData | null {
	const url = new URL(urlString);
	let contentId: string;
	let platform: 'youtube' | 'x' | 'instagram';
	switch (url.origin) {
		case 'https://youtu.be':
			platform = 'youtube';
			contentId = url.pathname.replace('/', '');
			break;
		case 'https://www.youtube.com':
			platform = 'youtube';
			contentId = url.searchParams.get('v') as string;
			break;
		case 'https://x.com':
			platform = 'x';
			contentId = url.pathname
				.split('/')
				.filter((str) => str)
				.at(-1) as string;
			break;
		case 'https://www.instagram.com':
			platform = 'instagram';
			contentId = url.pathname
				.split('/')
				.filter((str) => str)
				.at(-1) as string;
			break;
		case 'https://instagram.com':
			platform = 'instagram';
			contentId = url.pathname
				.split('/')
				.filter((str) => str)
				.at(-1) as string;
			break;
		default:
			return null;
	}
	return {
		platform,
		url: urlString,
		contentId,
	};
}

export function isValidUrl(url: string) {
	try {
		const origin = new URL(url).origin;
		return true;
	} catch (error) {
		return false;
	}
}

export function memoize<T extends (...args: any[]) => any>(fn: T): T {
	const cache: { [key: string]: ReturnType<T> } = {};

	return ((...args: Parameters<T>): ReturnType<T> => {
		const key = JSON.stringify(args);
		if (cache[key] !== undefined) {
			return cache[key];
		} else {
			const result = fn(...args);
			cache[key] = result;
			return result;
		}
	}) as T;
}

export function memoizeAsync<T extends (...args: any[]) => Promise<any>>(fn: T): T {
	const cache: { [key: string]: ReturnType<T> } = {};

	return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
		const key = JSON.stringify(args);
		if (cache[key] !== undefined) {
			return await cache[key];
		} else {
			const result = await fn(...args);
			cache[key] = result;
			return result;
		}
	}) as T;
}
export function memoizePersistentAsync<T extends (...args: any[]) => Promise<any>>(
	fn: T,
	store: Store,
): T {
	return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
		const key = JSON.stringify(args);
		const cachedValue = store.get(key);
		if (cachedValue !== null) {
			try {
				return JSON.parse(cachedValue);
			} catch (error) {
				console.error('Error parsing cached value:', error);
				return await fn(...args);
			}
		} else {
			const result = await fn(...args);
			store.set(key, JSON.stringify(result));
			return result;
		}
	}) as T;
}

export function formatNumberWithKMB(num: number): string {
	const formatter = new Intl.NumberFormat('en-US', {
		notation: 'compact',
		minimumSignificantDigits: 1,
		maximumSignificantDigits: 3,
	});

	return formatter.format(num);
}
export function currencyToNumber(formattedCurrency: string): number {
	// Remove everything except digits, minus sign, and decimal point
	const numericString = formattedCurrency.replace(/[^0-9.-]+/g, '');

	// Convert the string back to a number
	const parsedNumber = Number.parseFloat(numericString);

	// Handle potential NaN if parsing fails
	if (isNaN(parsedNumber)) {
		throw new Error('Invalid currency format');
	}

	return parsedNumber;
}

export function createLabels(e: string) {
	return e
		.replaceAll('_', ' ')
		.replace(/\b\w/g, (char) => char.toUpperCase())
		.trim();
}

export { cva, type VariantProps } from 'class-variance-authority';
