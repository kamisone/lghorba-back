/** Slugify a string: normalize unicode, lowercase, replace spaces, strip specials. */
export function slugify(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Strip HTML tags and calculate reading time (200 wpm). */
export function calculateReadingTime(html: string | null): number {
  if (!html) return 0;
  const text  = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
