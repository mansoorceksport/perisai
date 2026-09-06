import licensedData from '../data/licensed-lenders.json';
import illegalData from '../data/illegal-lenders.json';
import { LenderLookupResult, LenderCandidate, BlockedListing } from './types';

export interface LicensedLenderRecord {
  no: number;
  company_name: string;
  platform_name: string;
  license_number: string;
  license_date: string;
  license_date_raw: string;
  business_model: string;
  website: string;
}

export interface IllegalLenderRecord {
  no: number;
  url: string;
  host: string;
  channel: string;
  name: string;
  name_is_placeholder: boolean;
  developer: string | null;
  flags: string[];
}

/**
 * C1. Normalize: lowercase, strip punctuation and whitespace only.
 * Nothing more. No embeddings, no Levenshtein, no fuzzy threshold.
 */
export function normalizeString(str: string): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * C2. Split on the first separator to extract head form.
 * "Uang Cepat - Pinjaman Duit Cair Tunai"  -> "Uang Cepat"
 * "DanaCita : Pinjaman Dana Cepat"         -> "DanaCita"
 *
 * Still exact matching, not fuzzy: a fixed separator set, first occurrence,
 * no scoring or distance. Blocklist entries are marketing titles that append a
 * tagline after a separator, and the separator is not always a dash. With ':'
 * missing, "DanaCita : Pinjaman Dana Cepat" normalized to
 * `danacitapinjamandanacepat` and its collision with the licensed `Danacita`
 * was never detected.
 */
const HEAD_SEPARATORS = ['-', ':'];

export function extractHeadForm(name: string): string {
  const positions = HEAD_SEPARATORS.map((sep) => name.indexOf(sep)).filter((i) => i !== -1);
  if (positions.length === 0) return name.trim();
  return name.slice(0, Math.min(...positions)).trim();
}

export class LenderRegistry {
  private licensedByNormalizedName = new Map<string, LicensedLenderRecord>();
  /** Full blocklist names. An exact hit here is an assertable BLOCKED verdict. */
  private blockedExactByNormalizedName = new Map<string, IllegalLenderRecord[]>();
  /**
   * Head-form FRAGMENTS of blocklist names, kept apart from the full names on
   * purpose. A head form is a truncation of a marketing title, not a name
   * anyone registered: "D-duit pinjaman uang cepat" yields the key `d`, and
   * "Ayo: Pinjaman Tanpa Agunan" yields `ayo`. Indexed together with the full
   * names, a one-letter query produced a red BLOCKED verdict with a complaint
   * action against a real company. A fragment match is a suggestion, not a
   * finding, so it routes to AMBIGUOUS. Do not merge these two maps.
   */
  private blockedHeadByNormalizedName = new Map<string, IllegalLenderRecord[]>();
  private allLicensedCandidates: Array<{ name: string; record: LicensedLenderRecord }> = [];

  constructor() {
    this.indexLicensed();
    this.indexBlocked();
  }

  private indexLicensed() {
    const list = (licensedData.lenders || []) as LicensedLenderRecord[];
    for (const item of list) {
      // Index company_name
      const normCompany = normalizeString(item.company_name);
      if (normCompany) {
        this.licensedByNormalizedName.set(normCompany, item);
      }
      // Also index company_name without "PT" prefix if present
      const strippedCompany = item.company_name.replace(/^PT\s+/i, '').trim();
      const normStrippedCompany = normalizeString(strippedCompany);
      if (normStrippedCompany) {
        this.licensedByNormalizedName.set(normStrippedCompany, item);
      }

      // Index platform_name (both full and head form)
      const normPlatform = normalizeString(item.platform_name);
      if (normPlatform) {
        this.licensedByNormalizedName.set(normPlatform, item);
      }
      const headPlatform = extractHeadForm(item.platform_name);
      const normHead = normalizeString(headPlatform);
      if (normHead) {
        this.licensedByNormalizedName.set(normHead, item);
      }

      this.allLicensedCandidates.push({ name: item.platform_name, record: item });
      this.allLicensedCandidates.push({ name: item.company_name, record: item });
    }
  }

  private indexBlocked() {
    const rawList = (illegalData.illegal_lending || []) as IllegalLenderRecord[];
    // C3: Exclude rows where channel == "facebook" OR name_is_placeholder == true
    const filteredList = rawList.filter(
      (row) => row.channel !== 'facebook' && !row.name_is_placeholder
    );

    for (const item of filteredList) {
      if (!item.name) continue;
      // Index full form and head form (C2). Several distinct blocklist rows can
      // share a key — six separate rows normalize to `danaku` — so each key
      // holds every matching record. The previous Map<string, record> kept only
      // whichever row happened to be indexed last, discarding the others and
      // with them the channel spread that identifies an impersonation.
      const normFull = normalizeString(item.name);
      if (normFull) LenderRegistry.push(this.blockedExactByNormalizedName, normFull, item);

      const normHead = normalizeString(extractHeadForm(item.name));
      // Only when the head form is genuinely a truncation. A name with no
      // separator is its own head form and belongs in the exact map alone.
      if (normHead && normHead !== normFull) {
        LenderRegistry.push(this.blockedHeadByNormalizedName, normHead, item);
      }
    }
  }

  private static push(
    map: Map<string, IllegalLenderRecord[]>,
    key: string,
    item: IllegalLenderRecord
  ) {
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }

  /** Licensed entries whose name contains, or is contained by, the query. */
  private licensedCandidates(normalized: string): LenderCandidate[] {
    if (normalized.length < 3) return [];
    const candidates: LenderCandidate[] = [];
    const seen = new Set<string>();
    for (const cand of this.allLicensedCandidates) {
      const normCand = normalizeString(cand.name);
      if (normCand.includes(normalized) || normalized.includes(normCand)) {
        if (!seen.has(cand.record.company_name)) {
          seen.add(cand.record.company_name);
          candidates.push({
            type: 'licensed',
            name: cand.record.platform_name,
            detail: `${cand.record.company_name} (Izin: ${cand.record.license_number})`,
          });
        }
      }
      if (candidates.length >= 4) break;
    }
    return candidates;
  }

  /** Deduplicates the raw blocklist rows behind a key for display. */
  private static toListings(records: IllegalLenderRecord[]): BlockedListing[] {
    const seen = new Set<string>();
    const listings: BlockedListing[] = [];
    for (const r of records) {
      const fingerprint = `${r.name}|${r.channel}|${r.developer ?? ''}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      listings.push({ name: r.name, channel: r.channel, developer: r.developer });
    }
    return listings;
  }

  public lookup(query: string): LenderLookupResult {
    const trimmed = query.trim();
    const normalized = normalizeString(trimmed);

    if (!normalized) {
      return {
        query: trimmed,
        normalized_query: normalized,
        status: 'NOT FOUND',
        notes: ['Empty or invalid search query.'],
      };
    }

    // Query BOTH registries before deciding anything. Returning on the first
    // hit made the licensed registry shadow the blocklist: normalization
    // case-folds, so a blocked "DanaKu" and a licensed "Danaku" are the same
    // key by construction, and the blocked row was unreachable. Five names in
    // the current data collide, and their blocklist rows are third-party APK
    // mirrors and lookalike sites carrying a licensed brand — the
    // impersonation pattern this check exists to catch. Reporting them
    // LICENSED handed the impersonator the real company's credentials.
    const licensedMatch = this.licensedByNormalizedName.get(normalized);
    const blockedExact = this.blockedExactByNormalizedName.get(normalized) ?? [];
    const blockedHeadOnly = this.blockedHeadByNormalizedName.get(normalized) ?? [];
    // CONTESTED weighs both: two of the five contested names in the current
    // data (`pinjamyuk`, `danacita`) exist only as head forms. CONTESTED makes
    // no accusation — it states that the name is used by two parties and shows
    // both — so a fragment match supports it. Only the red verdict is demoted.
    const blockedForContest = [...blockedExact, ...blockedHeadOnly];
    const blockedListings = LenderRegistry.toListings(blockedForContest);

    const licensedData = licensedMatch && {
      company_name: licensedMatch.company_name,
      platform_name: licensedMatch.platform_name,
      license_number: licensedMatch.license_number,
      license_date: licensedMatch.license_date,
      business_model: licensedMatch.business_model,
      website: licensedMatch.website,
    };

    // Step 1: the name appears in both registries.
    if (licensedData && blockedListings.length > 0) {
      return {
        query: trimmed,
        normalized_query: normalized,
        status: 'CONTESTED',
        licensed_data: licensedData,
        blocked_listings: blockedListings,
        notes: [
          'This name matches a licensed OJK entity AND one or more entries on the Satgas PASTI blocklist.',
          'The licensed entity remains licensed. Its name is being used by a separate, blocked distribution.',
          'Resolve it by the legal PT name on the loan agreement, and by the channel the app was installed from.',
        ],
      };
    }

    // Step 2: licensed only.
    if (licensedData) {
      return {
        query: trimmed,
        normalized_query: normalized,
        status: 'LICENSED',
        licensed_data: licensedData,
        notes: [
          'Matched official OJK licensed registry.',
          'Being licensed does not make a lender conduct lawful. Excessive rates or abusive collection remain strictly reportable.',
        ],
      };
    }

    // Step 3: an exact blocklist name. The only path to a red verdict.
    if (blockedExact.length > 0) {
      const primary = blockedExact[0];
      return {
        query: trimmed,
        normalized_query: normalized,
        status: 'BLOCKED',
        blocked_data: {
          name: primary.name,
          channel: primary.channel,
          developer: primary.developer,
          blocked_date: illegalData.as_of || '2026-04',
        },
        blocked_listings: LenderRegistry.toListings(blockedExact),
        notes: [
          'Matched Satgas PASTI quarterly enforcement list.',
          'Entity is unlicensed and blocked by the regulatory taskforce.',
        ],
      };
    }

    // Step 4: a head-form fragment matched, but no full blocklist name did.
    // The fragment is real, so it is worth showing; it is not evidence that
    // the user's lender is on the enforcement list, so it is not asserted.
    // Rule 1, same reasoning that keeps NOT FOUND amber.
    if (blockedHeadOnly.length > 0) {
      const seen = new Set<string>();
      const candidates: LenderCandidate[] = [];
      for (const record of blockedHeadOnly) {
        if (seen.has(record.name)) continue;
        seen.add(record.name);
        candidates.push({
          type: 'blocked',
          name: record.name,
          detail: `Satgas PASTI — ${record.channel}`,
        });
        if (candidates.length >= 4) break;
      }
      return {
        query: trimmed,
        normalized_query: normalized,
        status: 'AMBIGUOUS',
        candidates: [...candidates, ...this.licensedCandidates(normalized)],
        notes: [
          'The query matches only the leading fragment of one or more blocklist entries.',
          'This is a name suggestion, not a finding. It is not evidence that this lender is blocked.',
          'Select an entry to check its full name, or enter the complete app name.',
        ],
      };
    }

    // Step 5: C6 Check close but non-exact licensed names
    const licensedNear = this.licensedCandidates(normalized);
    if (licensedNear.length > 0) {
      return {
        query: trimmed,
        normalized_query: normalized,
        status: 'AMBIGUOUS',
        candidates: licensedNear,
        notes: [
          'Multiple potential official candidates found. Please verify the legal PT name on your loan agreement.',
        ],
      };
    }

    // Step 6: C5 NOT FOUND (Amber, never red)
    // Absence from registry is not proof of illegality
    return {
      query: trimmed,
      normalized_query: normalized,
      status: 'NOT FOUND',
      notes: [
        'Not found in 94 licensed registry or current blocklist sample.',
        'Not definitive proof of illegality.',
        'Check loan contract for legal PT entity name, or verify with OJK 157.',
      ],
    };
  }
}

// Singleton registry instance
let registryInstance: LenderRegistry | null = null;

export function getLenderRegistry(): LenderRegistry {
  if (!registryInstance) {
    registryInstance = new LenderRegistry();
  }
  return registryInstance;
}

export function lookupLender(query: string): LenderLookupResult {
  return getLenderRegistry().lookup(query);
}
