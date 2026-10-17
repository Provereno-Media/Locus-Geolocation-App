import type { Coordinates } from '../services/geo/types';

export function formatLatitude(lat: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}`;
}

export function formatLongitude(lng: number): string {
  return `${Math.abs(lng).toFixed(4)}° ${lng < 0 ? 'W' : 'E'}`;
}

/** Decimal "lat, lng" for pasting into maps and search tools. */
export function formatDecimalPair(c: Coordinates): string {
  return `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
}

function toDms(value: number, positive: string, negative: string): string {
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.floor((abs - deg) * 60);
  let sec = Math.round(((abs - deg) * 60 - min) * 600) / 10;
  if (sec >= 60) {
    sec = 0;
    min += 1;
  }
  if (min >= 60) {
    min = 0;
    deg += 1;
  }
  return `${deg}°${String(min).padStart(2, '0')}'${sec.toFixed(1).padStart(4, '0')}"${value < 0 ? negative : positive}`;
}

/** Degrees, minutes, seconds as Google Maps and Google Earth accept it: 59°26'13.1"N 24°45'12.7"E */
export function formatDms(c: Coordinates): string {
  return `${toDms(c.lat, 'N', 'S')} ${toDms(c.lng, 'E', 'W')}`;
}
