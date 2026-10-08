import { describe, expect, it } from 'vitest';
import { extractJsonObject, normalizeStoredResult, parseModelGeolocation } from './schema';

const valid = {
  locationName: 'Tallinn, Estonia',
  coordinates: { lat: 59.437, lng: 24.7536 },
  confidence: 0.8,
  evidence: ['Estonian text on sign'],
  description: 'Old Town architecture',
  extractedText: ['Raekoja plats [Town Hall Square]'],
  identifiedSymbols: [],
  searchQueriesExecuted: ['Raekoja plats Tallinn'],
};

describe('extractJsonObject', () => {
  it('returns plain JSON unchanged', () => {
    const json = JSON.stringify(valid);
    expect(extractJsonObject(json)).toBe(json);
  });

  it('strips markdown fences and surrounding prose', () => {
    const json = JSON.stringify(valid);
    expect(extractJsonObject(`Here is the result:\n\`\`\`json\n${json}\n\`\`\`\nDone.`)).toBe(json);
  });

  it('is not fooled by braces inside strings', () => {
    const json = JSON.stringify({ ...valid, description: 'sign reads "}{" and {curly}' });
    expect(extractJsonObject(`${json} trailing {garbage}`)).toBe(json);
  });

  it('returns null when there is no object', () => {
    expect(extractJsonObject('I could not determine the location.')).toBeNull();
  });
});

describe('parseModelGeolocation', () => {
  it('parses a valid answer', () => {
    const r = parseModelGeolocation(JSON.stringify(valid));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.coordinates).toEqual({ lat: 59.437, lng: 24.7536 });
      expect(r.data.confidence).toBe(0.8);
    }
  });

  it('normalizes percent confidence and string coordinates', () => {
    const r = parseModelGeolocation(
      JSON.stringify({ ...valid, confidence: 85, coordinates: { lat: '-33.8688', lng: '151.2093' } }),
    );
    expect(r.ok && r.data.confidence).toBe(0.85);
    expect(r.ok && r.data.coordinates).toEqual({ lat: -33.8688, lng: 151.2093 });
  });

  it('treats null and (0,0) coordinates as undetermined with zero confidence', () => {
    for (const coordinates of [null, { lat: null, lng: null }, { lat: 0, lng: 0 }]) {
      const r = parseModelGeolocation(JSON.stringify({ ...valid, coordinates, confidence: 0.6 }));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.coordinates).toBeNull();
        expect(r.data.confidence).toBe(0);
      }
    }
  });

  it('fills missing optional fields', () => {
    const r = parseModelGeolocation(JSON.stringify({ coordinates: valid.coordinates, confidence: 0.5 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.locationName).toBe('Location not determined');
      expect(r.data.evidence).toEqual([]);
      expect(r.data.searchQueriesExecuted).toEqual([]);
    }
  });

  it('rejects out-of-range coordinates', () => {
    const r = parseModelGeolocation(JSON.stringify({ ...valid, coordinates: { lat: 120, lng: 10 } }));
    expect(r.ok).toBe(false);
  });

  it('rejects malformed JSON', () => {
    expect(parseModelGeolocation('{"locationName": "x", ').ok).toBe(false);
  });
});

describe('normalizeStoredResult', () => {
  it('reads the pre-0.4 history format', () => {
    const legacy = { ...valid, sources: [{ uri: 'https://example.org', title: 'Example', type: 'web' }] };
    const r = normalizeStoredResult(legacy);
    expect(r?.modelReportedQueries).toEqual(['Raekoja plats Tallinn']);
    expect(r?.groundingQueries).toEqual([]);
    expect(r?.sources).toHaveLength(1);
    expect(r?.model).toBe('unknown');
  });

  it('returns null for garbage', () => {
    expect(normalizeStoredResult({ coordinates: { lat: 999, lng: 0 } })).toBeNull();
  });
});
