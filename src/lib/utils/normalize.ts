/** Diacritic/case-insensitive normalization, used for client-side search/filtering. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function textIncludes(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return normalizeText(haystack).includes(normalizeText(needle));
}
