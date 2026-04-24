const MAPS_PATTERN =
  /https?:\/\/\S*(maps\.google|google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|waze\.com|maps\.apple)\S*/i;

export function extractMapsUrl(text: string): string | null {
  const match = text.match(MAPS_PATTERN);
  return match ? match[0] : null;
}

export function extractLatLng(url: string): { lat: number; lng: number } | null {
  let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}
