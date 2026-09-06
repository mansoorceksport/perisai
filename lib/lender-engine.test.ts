import { describe, expect, test } from 'bun:test';
import { extractHeadForm, lookupLender, normalizeString } from './lender-engine';

/**
 * The five names present in BOTH registries. Each blocklist row carries a
 * licensed brand, so returning LICENSED handed an impersonator the real
 * company's licence number. Regenerate this table by intersecting the two
 * normalized key sets, not by hand.
 */
const CONTESTED = [
  { query: 'Danaku', company: 'PT Trust Teknologi Finansial', licence: 'KEP-30/D.05/2021' },
  { query: 'Mekar', company: 'PT Mekar InvestamaTeknologi', licence: 'KEP-127/D.05/2019' },
  { query: 'Pinjamyuk', company: 'PT Kuaikuai Tech Indonesia', licence: 'KEP-2/D.05/2021' },
  { query: 'Uangme', company: 'PT Uangme Fintek Indonesia', licence: 'KEP-4/D.05/2021' },
  { query: 'Danacita', company: 'PT Inclusive Finance Group', licence: 'KEP-68/D.05/2021' },
];

describe('contested names — a licensed match must not shadow a blocked one', () => {
  test.each(CONTESTED)('$query resolves to CONTESTED', ({ query }) => {
    expect(lookupLender(query).status).toBe('CONTESTED');
  });

  test.each(CONTESTED)('$query keeps the licensed record intact', ({ query, company, licence }) => {
    const r = lookupLender(query);
    expect(r.licensed_data?.company_name).toBe(company);
    expect(r.licensed_data?.license_number).toBe(licence);
  });

  test.each(CONTESTED)('$query surfaces at least one blocklist listing with a channel', ({ query }) => {
    const listings = lookupLender(query).blocked_listings ?? [];
    expect(listings.length).toBeGreaterThan(0);
    for (const l of listings) {
      expect(l.channel.length).toBeGreaterThan(0);
      expect(l.name.length).toBeGreaterThan(0);
    }
  });

  // Case-folding is the whole mechanism: these differ only by case, so they
  // are the same key by construction and must reach the same verdict.
  test.each([
    ['DanaKu', 'Danaku'],
    ['MEKAR', 'Mekar'],
    ['UangMe', 'Uangme'],
    ['DanaCita', 'danacita'],
  ])('%s and %s are the same key and the same verdict', (a, b) => {
    expect(normalizeString(a)).toBe(normalizeString(b));
    expect(lookupLender(a).status).toBe(lookupLender(b).status);
  });

  test('a contested verdict never carries blocked_data, so nothing treats it as BLOCKED', () => {
    for (const { query } of CONTESTED) {
      expect(lookupLender(query).blocked_data).toBeUndefined();
    }
  });

  test('DanaKu exposes every distinct blocklist row, deduplicated', () => {
    const listings = lookupLender('DanaKu').blocked_listings ?? [];
    // Six raw rows, one an exact duplicate — five distinct listings remain.
    expect(listings.length).toBe(5);
    expect(new Set(listings.map((l) => l.channel))).toEqual(
      new Set(['softonic', 'aptoide', 'apkcombo'])
    );
  });
});

describe('head form extraction', () => {
  test.each([
    ['Uang Cepat - Pinjaman Duit Cair Tunai', 'Uang Cepat'],
    ['DanaCita : Pinjaman Dana Cepat', 'DanaCita'],
    ['DanaCair:Pinjam Cash Cepat', 'DanaCair'],
    ['DanaKu- Pinjaman Online', 'DanaKu'],
    ['Danamas', 'Danamas'],
  ])('%s -> %s', (input, expected) => {
    expect(extractHeadForm(input)).toBe(expected);
  });

  test('splits on the earliest separator, whichever it is', () => {
    expect(extractHeadForm('A : B - C')).toBe('A');
    expect(extractHeadForm('A - B : C')).toBe('A');
  });
});

describe('uncontested verdicts are unchanged', () => {
  // Deliberately a name with no separator. `Uang Cepat` is NOT a full blocklist
  // name — it is the head form of "Uang Cepat - Pinjaman Duit Cair Tunai" — so
  // it is a fragment and routes to AMBIGUOUS by design, not a regression.
  test('a full blocklist name is BLOCKED', () => {
    const r = lookupLender('Pinjamnow');
    expect(r.status).toBe('BLOCKED');
    expect(r.blocked_data?.channel).toBeTruthy();
    expect(r.licensed_data).toBeUndefined();
  });

  test('Uang Cepat is a fragment, so it suggests rather than accuses', () => {
    const r = lookupLender('Uang Cepat');
    expect(r.status).toBe('AMBIGUOUS');
    expect((r.candidates ?? []).some((c) => c.type === 'blocked')).toBe(true);
  });

  test('a name only on the licensed registry is LICENSED', () => {
    const r = lookupLender('Danamas');
    expect(r.status).toBe('LICENSED');
    expect(r.blocked_listings).toBeUndefined();
  });

  // Rule 1: absence is never evidence of illegality.
  test('an unknown name is NOT FOUND, never BLOCKED', () => {
    const r = lookupLender('Zzz Perusahaan Tidak Ada');
    expect(r.status).toBe('NOT FOUND');
    expect(r.notes.join(' ')).toContain('Not definitive proof of illegality');
  });

  test('an empty query is NOT FOUND, not a match', () => {
    expect(lookupLender('   ').status).toBe('NOT FOUND');
  });
});

/**
 * A head form is a truncation of a blocklist marketing title, not a registered
 * name. Indexed alongside the full names it made these queries red BLOCKED
 * verdicts carrying a complaint action — an accusation the data does not
 * support. They must suggest, not assert.
 */
describe('head-form fragments suggest, they do not accuse', () => {
  test.each([
    ['d', 'D-duit pinjaman uang cepat'],
    ['do', 'Do-It Pinjaman Uang Online'],
    ['ve', 'Ve-lot Online:Pinjaman Pnstan'],
    ['ayo', 'Ayo: Pinjaman Tanpa Agunan'],
    ['kya', 'Kya-Pinjaman Online'],
    ['258', '258-Pinjaman Online Cepat'],
  ])('%s is AMBIGUOUS, offering %s as a candidate', (query, expectedCandidate) => {
    const r = lookupLender(query);
    expect(r.status).toBe('AMBIGUOUS');
    expect(r.blocked_data).toBeUndefined();
    const blocked = (r.candidates ?? []).filter((c) => c.type === 'blocked');
    expect(blocked.map((c) => c.name)).toContain(expectedCandidate);
  });

  // BLOCKED is the only verdict that offers a complaint action, so a demoted
  // fragment must never reach it.
  test.each(['d', 'do', 've', 'ayo', 'kya', '258'])('%s never reaches BLOCKED', (query) => {
    expect(lookupLender(query).status).not.toBe('BLOCKED');
  });

  test('a blocked candidate carries its channel, so the entry can be identified', () => {
    const blocked = (lookupLender('ayo').candidates ?? []).filter((c) => c.type === 'blocked');
    expect(blocked[0].detail).toContain('Satgas PASTI');
    expect(blocked[0].detail).toContain('softonic');
  });

  // The demotion must not swallow real hits: a full blocklist name is still red.
  test.each(['Pinjamnow', 'Dolang', 'KitaRupiah', 'Pinjamindo'])(
    '%s is a full blocklist name and still returns BLOCKED',
    (query) => {
      const r = lookupLender(query);
      expect(r.status).toBe('BLOCKED');
      expect(r.blocked_data?.name).toBeTruthy();
    }
  );

  // Two of the five contested names exist only as head forms. CONTESTED makes
  // no accusation and offers no complaint action, so a fragment supports it.
  test.each(['Pinjamyuk', 'Danacita'])('%s is contested via a head form and stays CONTESTED', (q) => {
    expect(lookupLender(q).status).toBe('CONTESTED');
  });

  test('a licensed near-match with no blocklist fragment still lists licensed candidates', () => {
    const r = lookupLender('PT Danamas');
    expect(r.status).toBe('AMBIGUOUS');
    expect((r.candidates ?? []).every((c) => c.type === 'licensed')).toBe(true);
  });
});
