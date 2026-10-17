import { describe, expect, it } from 'vitest';
import type { GeolocationResult } from '../services/geo/types';
import {
  base64ToBytes,
  buildGeoJson,
  buildKml,
  buildMarkdownReport,
  exportFileName,
  mapLinks,
  sha256Hex,
} from './exportResult';

const ctx = { imageSha256: 'ab'.repeat(32) };

function result(overrides: Partial<GeolocationResult> = {}): GeolocationResult {
  return {
    locationName: 'Raekoja plats, Tallinn',
    coordinates: { lat: 59.43696, lng: 24.75353 },
    confidence: 0.72,
    evidence: ['Estonian text on a sign', 'Gothic town hall\nspire'],
    description: 'Text and architecture point to Tallinn Old Town.',
    extractedText: ['Apteek [Pharmacy]'],
    identifiedSymbols: [],
    modelReportedQueries: ['Raekoja plats'],
    groundingQueries: ['Tallinn town hall `square`'],
    sources: [
      { uri: 'https://example.org/a', title: 'Tallinn [guide]', type: 'web' },
      { uri: 'https://maps.google.com/?cid=1', title: 'Town Hall', type: 'maps' },
    ],
    model: 'gemini-3.6-flash',
    mode: 'visual',
    groundingTool: 'maps',
    analyzedAt: '2026-10-17T09:30:12.000Z',
    ...overrides,
  };
}

describe('sha256Hex', () => {
  it('hashes the image bytes', async () => {
    expect(await sha256Hex(base64ToBytes(btoa('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('exportFileName', () => {
  it('uses only the date and the hash prefix', () => {
    expect(exportFileName(result(), ctx, 'kml')).toBe('locus-2026-10-17-abababab.kml');
  });
});

describe('buildMarkdownReport', () => {
  it('includes the caveat, coordinates, hash, sources and executed queries', () => {
    const md = buildMarkdownReport(result(), {
      ...ctx,
      chat: [
        { role: 'user', text: 'Why Tallinn?' },
        { role: 'model', text: 'Because of the sign.' },
      ],
    });
    expect(md).toContain('not an established fact');
    expect(md).toContain(`59.436960, 24.753530 (59°26'13.1"N 24°45'12.7"E)`);
    expect(md).toContain('- **Model confidence:** 72%');
    expect(md).toContain('- **Analysed:** 2026-10-17 09:30 UTC');
    expect(md).toContain(ctx.imageSha256);
    expect(md).toContain('1. [Tallinn \\[guide\\]](<https://example.org/a>) — web');
    expect(md).toContain('2. [Town Hall](<https://maps.google.com/?cid=1>) — Google Maps');
    expect(md).toContain('- `` Tallinn town hall `square` ``');
    expect(md).toContain('- Gothic town hall spire');
    expect(md).toContain('**Question:** Why Tallinn?');
    expect(md).toContain('[OpenStreetMap](<https://www.openstreetmap.org/?mlat=59.436960&mlon=24.753530#map=17/59.436960/24.753530>)');
    expect(md).not.toContain('## Symbols');
  });

  it('works without coordinates and leaves out map links', () => {
    const md = buildMarkdownReport(result({ coordinates: null, confidence: 0 }), ctx);
    expect(md).toContain('- **Coordinates:** not determined');
    expect(md).not.toContain('## Check on maps');
    expect(md).not.toContain('## Analysis chat');
  });

  it('notes a model fallback', () => {
    expect(buildMarkdownReport(result({ modelFallbackFrom: 'gemini-3.8-flash' }), ctx)).toContain(
      'gemini-3.6-flash (fallback from gemini-3.8-flash)',
    );
  });
});

describe('buildKml', () => {
  it('writes a placemark in lng,lat order and escapes text', () => {
    const kml = buildKml(result({ locationName: 'Café <Old> & "New"' }), ctx)!;
    expect(kml).toContain('<coordinates>24.75353,59.43696,0</coordinates>');
    expect(kml).toContain('<name>Café &lt;Old&gt; &amp; &quot;New&quot;</name>');
    expect(kml).toContain(`<Data name="imageSha256"><value>${ctx.imageSha256}</value></Data>`);
  });

  it('returns null without coordinates', () => {
    expect(buildKml(result({ coordinates: null }), ctx)).toBeNull();
  });
});

describe('buildGeoJson', () => {
  it('writes a point feature in lng,lat order', () => {
    const geo = JSON.parse(buildGeoJson(result(), ctx)!);
    expect(geo.features[0].geometry).toEqual({ type: 'Point', coordinates: [24.75353, 59.43696] });
    expect(geo.features[0].properties).toMatchObject({ confidence: 0.72, imageSha256: ctx.imageSha256 });
  });

  it('returns null without coordinates', () => {
    expect(buildGeoJson(result({ coordinates: null }), ctx)).toBeNull();
  });
});

describe('mapLinks', () => {
  it('builds links with six decimals', () => {
    const links = mapLinks({ lat: -33.8688, lng: 151.2093 });
    expect(links.map((l) => l.label)).toEqual([
      'Google Maps',
      'Google Earth',
      'OpenStreetMap',
      'Mapillary',
      'Copernicus Browser',
    ]);
    expect(links[0].url).toBe('https://www.google.com/maps/search/?api=1&query=-33.868800,151.209300');
  });
});
