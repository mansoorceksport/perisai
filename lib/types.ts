export type Language = 'id' | 'en';

export type LoanPurpose = 'consumptive' | 'productive';

export interface UserProfile {
  uid: string;
  email: string | null;
  preferredLang: Language;
  createdAt: string;
}

export interface CaseRecord {
  id?: string;
  userId: string;
  type: 'lender_check' | 'rate_check' | 'conduct_check';
  input: Record<string, unknown>;
  verdict: Record<string, unknown>;
  createdAt: string;
}

export interface RateEvaluation {
  /**
   * Rate against the nilai Pendanaan stated in the agreement. This is the
   * regulator's own test and the figure compared against the cap.
   * Stored at full precision — round only at render.
   */
  regulatory_daily_rate: number;
  regulatory_daily_pct: number;
  /** Rate against cash actually disbursed. The borrower's real burden. */
  experienced_daily_rate: number;
  experienced_daily_pct: number;
  total_manfaat_ekonomi: number;
  cap_percent_per_day: number | null;
  /** regulatory_daily_pct / cap. Null when no band matched. Full precision. */
  multiple_over_cap: number | null;
  citation: string | null;
  status: 'compliant' | 'exceeded' | 'no_cap_defined';
  lock_cap_status: 'compliant' | 'breached';
  lock_cap_citation: string;
  lock_cap_explanation: string;
  details: {
    contract_principal: number;
    net_disbursed: number;
    total_repayment: number;
    tenor_days: number;
    purpose: LoanPurpose;
  };
}

export type LenderStatus = 'LICENSED' | 'BLOCKED' | 'NOT FOUND' | 'AMBIGUOUS' | 'CONTESTED';

/**
 * One Satgas PASTI blocklist row behind a queried name. Several rows can share
 * a normalized name, and the `channel` spread across them is the diagnostic
 * signal: third-party APK mirrors (aptoide, softonic, apkcombo) carrying a
 * licensed brand indicate impersonation rather than the licensed lender.
 */
export interface BlockedListing {
  name: string;
  channel: string;
  developer: string | null;
}

export interface LenderCandidate {
  type: 'licensed' | 'blocked';
  name: string;
  detail: string;
}

export interface LenderLookupResult {
  query: string;
  normalized_query: string;
  status: LenderStatus;
  licensed_data?: {
    company_name: string;
    platform_name: string;
    license_number: string;
    license_date: string;
    business_model: string;
    website: string;
  };
  blocked_data?: {
    name: string;
    channel: string;
    developer: string | null;
    blocked_date: string;
  };
  /**
   * Every deduplicated blocklist row behind the query. Populated for BLOCKED
   * and for CONTESTED. On CONTESTED, `licensed_data` is populated too and
   * `blocked_data` deliberately is not — the licensed entity is licensed, and
   * nothing downstream may treat this verdict as a blocked one.
   */
  blocked_listings?: BlockedListing[];
  candidates?: LenderCandidate[];
  notes: string[];
}

export interface ConductViolation {
  rule_id: string;
  title: string;
  citation: string;
  severity: 'critical' | 'high' | 'medium';
  explanation: string;
  matched_phrase: string;
  prohibited_evidence?: string;
}

export interface ConductAnalysisResult {
  matched_rules: ConductViolation[];
  total_violations: number;
  summary: string;
}

export interface ComplaintDraft {
  recipient_agency: string;
  lender_name: string;
  lender_status: string;
  violations: Array<{
    citation: string;
    description: string;
    evidence: string;
  }>;
  remedy_requested: string;
  draft_text: string;
  submission_channels: Array<{
    name: string;
    contact: string;
    method: string;
  }>;
}
