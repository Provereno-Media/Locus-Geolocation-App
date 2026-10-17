import { describe, expect, it } from 'vitest';
import { formatDecimalPair, formatDms, formatLatitude, formatLongitude } from './coords';

describe('coordinate formatting', () => {
  it('uses hemisphere letters by sign', () => {
    expect(formatLatitude(59.437)).toBe('59.4370° N');
    expect(formatLatitude(-33.8688)).toBe('33.8688° S');
    expect(formatLongitude(24.7536)).toBe('24.7536° E');
    expect(formatLongitude(-58.3816)).toBe('58.3816° W');
  });

  it('formats a decimal pair for copying', () => {
    expect(formatDecimalPair({ lat: -33.8688, lng: 151.2093 })).toBe('-33.868800, 151.209300');
  });

  it('formats degrees, minutes and seconds with hemispheres', () => {
    expect(formatDms({ lat: 59.43696, lng: 24.75353 })).toBe(`59°26'13.1"N 24°45'12.7"E`);
    expect(formatDms({ lat: -33.8688, lng: -58.3816 })).toBe(`33°52'07.7"S 58°22'53.8"W`);
    expect(formatDms({ lat: 10.99999999, lng: 0 })).toBe(`11°00'00.0"N 0°00'00.0"E`);
  });
});
