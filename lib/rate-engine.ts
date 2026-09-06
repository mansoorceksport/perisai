import rateCapsData from '../data/rate-caps.json';
import { LoanPurpose, RateEvaluation } from './types';

export interface RateCapBand {
  id: string;
  purpose: string;
  principal_min: number;
  principal_max: number | null;
  tenor_min_days: number;
  tenor_max_days: number | null;
  max_daily_rate: number;
  citation: string;
  label_id: string;
  label_en: string;
}

/**
 * Number of decimal places OJK uses when publishing daily rates in the
 * SEOJK 19/SEOJK.06/2025 Romawi XIV worked examples (0.017%, 0.007%).
 * Display only. Never round before a threshold comparison — rounding a rate
 * that is over the cap down onto the cap would report an illegal loan as legal.
 */
export const RATE_DISPLAY_DECIMALS = 3;

export function formatRatePct(pct: number): string {
  return pct.toFixed(RATE_DISPLAY_DECIMALS);
}

export interface ManfaatEkonomiRates {
  totalManfaatEkonomi: number;
  /** Against nilai Pendanaan in the agreement. The regulator's own test. Full precision. */
  regulatoryDailyRate: number;
  regulatoryDailyPct: number;
  /** Against cash that actually landed in the borrower's account. Full precision. */
  experiencedDailyRate: number;
  experiencedDailyPct: number;
}

/**
 * SEOJK 19/SEOJK.06/2025 Romawi XIV:
 *   total_manfaat_ekonomi / (nilai_pendanaan_perjanjian * tenor_days) * 100
 *
 * The denominator is the contract value, NOT the amount disbursed
 * (see rate-caps.json formula.denominator_basis). The two differ exactly when
 * fees are deducted upfront, so both figures are returned and never merged.
 */
export function calculateManfaatEkonomiRates(
  contractPrincipal: number,
  netDisbursed: number,
  totalRepayment: number,
  tenorDays: number
): ManfaatEkonomiRates {
  if (contractPrincipal <= 0 || netDisbursed <= 0 || tenorDays <= 0) {
    throw new Error('Contract principal, net disbursed, and tenor must be strictly positive numbers.');
  }

  const totalManfaatEkonomi = totalRepayment - netDisbursed;

  // Keep the inner parentheses — a / b * c is silently wrong.
  const regulatoryDailyRate = totalManfaatEkonomi / (contractPrincipal * tenorDays);
  const experiencedDailyRate = totalManfaatEkonomi / (netDisbursed * tenorDays);

  return {
    totalManfaatEkonomi,
    regulatoryDailyRate,
    regulatoryDailyPct: regulatoryDailyRate * 100,
    experiencedDailyRate,
    experiencedDailyPct: experiencedDailyRate * 100,
  };
}

/**
 * rate-caps.json states band purposes in the regulation's own vocabulary.
 * LoanPurpose is the app's internal enum. Comparing the two directly matches
 * nothing and silently drops every evaluation into no_cap_defined.
 */
const BAND_PURPOSE: Record<LoanPurpose, string> = {
  consumptive: 'konsumtif',
  productive: 'produktif',
};

export interface RateCapParams {
  contractPrincipal: number;
  netDisbursed: number;
  totalRepayment: number;
  tenorDays: number;
  purpose: LoanPurpose;
}

export function evaluateRateCap(params: RateCapParams): RateEvaluation {
  const {
    totalManfaatEkonomi,
    regulatoryDailyRate,
    regulatoryDailyPct,
    experiencedDailyRate,
    experiencedDailyPct,
  } = calculateManfaatEkonomiRates(
    params.contractPrincipal,
    params.netDisbursed,
    params.totalRepayment,
    params.tenorDays
  );

  const detailsPayload = {
    contract_principal: params.contractPrincipal,
    net_disbursed: params.netDisbursed,
    total_repayment: params.totalRepayment,
    tenor_days: params.tenorDays,
    purpose: params.purpose,
  };

  // XIV.5: manfaat ekonomi plus penalties may not exceed 100% of the value
  // stated in the agreement. Measured against contract principal, not disbursed.
  const lockCapStatus: 'compliant' | 'breached' =
    totalManfaatEkonomi > params.contractPrincipal ? 'breached' : 'compliant';

  // Band selection keys off the contract value, the same basis as the cap itself.
  const caps = rateCapsData.caps as RateCapBand[];
  const bandPurpose = BAND_PURPOSE[params.purpose];
  const matchedBand = caps.find((band) => {
    if (band.purpose !== bandPurpose) return false;
    if (band.principal_max !== null && params.contractPrincipal > band.principal_max) return false;
    if (params.contractPrincipal < band.principal_min) return false;
    if (band.tenor_max_days !== null && params.tenorDays > band.tenor_max_days) return false;
    if (params.tenorDays < band.tenor_min_days) return false;
    return true;
  });

  const base = {
    regulatory_daily_rate: regulatoryDailyRate,
    regulatory_daily_pct: regulatoryDailyPct,
    experienced_daily_rate: experiencedDailyRate,
    experienced_daily_pct: experiencedDailyPct,
    total_manfaat_ekonomi: totalManfaatEkonomi,
    lock_cap_status: lockCapStatus,
    lock_cap_citation: rateCapsData.lock_cap.citation,
    lock_cap_explanation: rateCapsData.lock_cap.explanation_id,
    details: detailsPayload,
  };

  if (!matchedBand) {
    // Genuine band miss only. An unmatched combination is not a pass and not a
    // fail — it is a rendered unknown (rate-caps.json on_no_match).
    return {
      ...base,
      cap_percent_per_day: null,
      multiple_over_cap: null,
      citation: null,
      status: 'no_cap_defined',
    };
  }

  // Compared at full precision. Never against a rounded rate.
  const status: 'compliant' | 'exceeded' =
    regulatoryDailyPct <= matchedBand.max_daily_rate ? 'compliant' : 'exceeded';

  return {
    ...base,
    cap_percent_per_day: matchedBand.max_daily_rate,
    multiple_over_cap: regulatoryDailyPct / matchedBand.max_daily_rate,
    citation: matchedBand.citation,
    status,
  };
}
