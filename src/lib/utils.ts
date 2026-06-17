import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function generateVerificationId(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `VID-${timestamp}-${random}`;
}

export function formatMobileNumber(mobile: string): string {
    // Remove any non-digit characters
    const digits = mobile.replace(/\D/g, "");
    // If starts with 91 and has 12 digits, it's +91 prefixed
    if (digits.length === 12 && digits.startsWith("91")) {
        return digits.slice(2);
    }
    // If starts with 0 and has 11 digits, remove leading 0
    if (digits.length === 11 && digits.startsWith("0")) {
        return digits.slice(1);
    }
    // If exactly 10 digits, return as is
    if (digits.length === 10) {
        return digits;
    }
    return digits;
}

export function validateMobileNumber(mobile: string): boolean {
    const cleaned = formatMobileNumber(mobile);
    return /^[6-9]\d{9}$/.test(cleaned);
}

export function getFullMobileNumber(mobile: string): string {
    const cleaned = formatMobileNumber(mobile);
    return `+91${cleaned}`;
}
