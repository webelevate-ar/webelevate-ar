import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Une clases y deja ganar a la última cuando dos pisan la misma propiedad. */
export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas));
}
