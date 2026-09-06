import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Strips all undefined fields recursively (Directive 8: Persistence integrity)
 */
export function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        cleaned[key] = stripUndefined(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned as T;
}

/**
 * Escapes regular-expression metacharacters so a string can be embedded in a
 * pattern as a literal.
 *
 * This is NOT interchangeable with HTML escaping. HTML escaping neutralises
 * `< > & " '` and leaves `( ) [ ] * + ? . \ ^ $ { } |` untouched — precisely the
 * characters that change a pattern's meaning. Highlighting collector messages
 * needs both, in order: HTML-escape so the needle matches the escaped haystack,
 * then regex-escape so the needle is matched literally.
 *
 * Without this, a phrase from the model (echoing attacker-written text)
 * containing an unbalanced `(` or `[` throws inside render, and a phrase
 * containing `.` silently highlights the wrong characters.
 */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
