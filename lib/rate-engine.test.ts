import { describe, expect, test } from 'bun:test';
import rateCapsData from '../data/rate-caps.json';
import {
  RATE_DISPLAY_DECIMALS,
  calculateManfaatEkonomiRates,
  evaluateRateCap,
  formatRatePct,
} from './rate-engine';
import { LoanPurpose } from './types';

/**
 * The vectors in rate-caps.json are heterogeneous by design: the two SE worked
 * examples publish only nilai_pendanaan + total_manfaat_ekonomi, while the
 * Perisai cases publish amount_disbursed + total_repayment.
 */
interface RateTestVector {
  name: string;
  citation?: string;
  purpose: string;
  nilai_pendanaan: number;
  amount_disbursed?: number;
  total_repayment?: number;
  tenor_days: number;
  total_manfaat_ekonomi: number;
  expected_daily_rate_pct: number;
  expected_cap: number;
  expected_multiple_over_cap?: number;
  lock_cap_breached?: boolean;
  expected_verdict: 'within_cap' | 'over_cap';
}

const PURPOSE_MAP: Record<string, LoanPurpose> = {
  konsumtif: 'consumptive',
  produktif: 'productive',
};

const vectors = rateCapsData.unit_tests as RateTestVector[];

/**
 * Where a vector omits amount_disbursed, the contract value is what landed
 * (no upfront deduction). Where it omits total_repayment, repayment is the
 * contract value plus the published manfaat ekonomi. Both reconstructions
 * make totalRepayment - netDisbursed recover the SE's own figure.
 */
function paramsFor(v: RateTestVector) {
  const netDisbursed = v.amount_disbursed ?? v.nilai_pendanaan;
  const totalRepayment = v.total_repayment ?? v.nilai_pendanaan + v.total_manfaat_ekonomi;
  return {
    contractPrincipal: v.nilai_pendanaan,
    netDisbursed,
    totalRepayment,
    tenorDays: v.tenor_days,
    purpose: PURPOSE_MAP[v.purpose]!,
  };
}

describe('rate-caps.json published vectors', () => {
  test('every vector is exercised', () => {
    expect(vectors.length).toBe(4);
  });

  for (const v of vectors) {
    describe(v.name, () => {
      const params = paramsFor(v);
      const result = evaluateRateCap(params);

      test('manfaat ekonomi matches the published component total', () => {
        expect(result.total_manfaat_ekonomi).toBe(v.total_manfaat_ekonomi);
      });

      test(`regulatory rate renders as ${v.expected_daily_rate_pct}%`, () => {
        expect(formatRatePct(result.regulatory_daily_pct)).toBe(
          v.expected_daily_rate_pct.toFixed(RATE_DISPLAY_DECIMALS)
        );
      });

      test(`cap band resolves to ${v.expected_cap}%`, () => {
        expect(result.cap_percent_per_day).toBe(v.expected_cap);
      });

      test(`verdict is ${v.expected_verdict}`, () => {
        expect(result.status).toBe(v.expected_verdict === 'within_cap' ? 'compliant' : 'exceeded');
      });

      if (typeof v.expected_multiple_over_cap === 'number') {
        test(`multiple over cap is ${v.expected_multiple_over_cap}x`, () => {
          expect(result.multiple_over_cap).not.toBeNull();
          expect(Number(result.multiple_over_cap!.toFixed(1))).toBe(v.expected_multiple_over_cap!);
        });
      }

      if (typeof v.lock_cap_breached === 'boolean') {
        test(`lock cap (XIV.5) is ${v.lock_cap_breached ? 'breached' : 'compliant'}`, () => {
          expect(result.lock_cap_status).toBe(v.lock_cap_breached ? 'breached' : 'compliant');
        });
      }
    });
  }
});

describe('denominator basis (BUG 1)', () => {
  // Contract Rp1,000,000, Rp200,000 taken upfront, repay Rp1,300,000 over 30 days.
  const params = {
    contractPrincipal: 1_000_000,
    netDisbursed: 800_000,
    totalRepayment: 1_300_000,
    tenorDays: 30,
    purpose: 'consumptive' as LoanPurpose,
  };

  test('cap is measured against contract value, not cash disbursed', () => {
    const r = evaluateRateCap(params);
    expect(formatRatePct(r.regulatory_daily_pct)).toBe('1.667');
    expect(r.cap_percent_per_day).toBe(0.3);
    expect(r.status).toBe('exceeded');
  });

  test('the experienced rate is higher and reported separately', () => {
    const r = evaluateRateCap(params);
    expect(formatRatePct(r.experienced_daily_pct)).toBe('2.083');
    expect(r.experienced_daily_pct).toBeGreaterThan(r.regulatory_daily_pct);
  });

  test('lock cap is measured against contract value', () => {
    // manfaat 500,000 <= contract 1,000,000 -> compliant.
    // Against the 800,000 disbursed it would still be under, but the 100%
    // ceiling in XIV.5 is defined on nilai Pendanaan, so assert the basis.
    const r = evaluateRateCap(params);
    expect(r.lock_cap_status).toBe('compliant');

    const breaching = evaluateRateCap({ ...params, totalRepayment: 1_850_000 });
    // manfaat 1,050,000 > contract 1,000,000
    expect(breaching.lock_cap_status).toBe('breached');
  });
});

describe('rounding never decides a verdict (display only)', () => {
  // Konsumtif cap is 0.3%/day. Construct a loan at 0.3004%/day: it is over the
  // cap, but rounds to "0.300" at display precision. Rounding before the
  // comparison would report this illegal loan as compliant.
  const contractPrincipal = 1_000_000;
  const tenorDays = 100;
  const manfaat = 300_400; // 300400 / (1e6 * 100) * 100 = 0.3004%/day

  const result = evaluateRateCap({
    contractPrincipal,
    netDisbursed: contractPrincipal,
    totalRepayment: contractPrincipal + manfaat,
    tenorDays,
    purpose: 'consumptive',
  });

  test('a rate that rounds onto the cap still reads as exceeded', () => {
    expect(formatRatePct(result.regulatory_daily_pct)).toBe('0.300');
    expect(result.regulatory_daily_pct).toBeGreaterThan(0.3);
    expect(result.status).toBe('exceeded');
  });

  test('multiple_over_cap keeps full precision', () => {
    expect(result.multiple_over_cap).not.toBeNull();
    expect(result.multiple_over_cap!).toBeCloseTo(1.001333, 6);
  });

  test('a rate exactly on the cap is compliant', () => {
    const onCap = evaluateRateCap({
      contractPrincipal,
      netDisbursed: contractPrincipal,
      totalRepayment: contractPrincipal + 300_000,
      tenorDays,
      purpose: 'consumptive',
    });
    expect(onCap.regulatory_daily_pct).toBe(0.3);
    expect(onCap.status).toBe('compliant');
  });
});

describe('band coverage', () => {
  test('konsumtif and produktif are covered at every tenor and principal', () => {
    const cases: Array<[LoanPurpose, number, number]> = [
      ['consumptive', 500_000, 1],
      ['consumptive', 500_000, 180],
      ['consumptive', 500_000, 181],
      ['consumptive', 900_000_000, 3650],
      ['productive', 500_000, 180],
      ['productive', 50_000_000, 181],
      ['productive', 50_000_001, 1],
      ['productive', 900_000_000, 3650],
    ];
    for (const [purpose, principal, tenorDays] of cases) {
      const r = evaluateRateCap({
        contractPrincipal: principal,
        netDisbursed: principal,
        totalRepayment: principal,
        tenorDays,
        purpose,
      });
      expect(r.status).not.toBe('no_cap_defined');
      expect(r.cap_percent_per_day).not.toBeNull();
    }
  });
});

describe('input guards', () => {
  const ok = {
    contractPrincipal: 1_000_000,
    netDisbursed: 800_000,
    totalRepayment: 1_300_000,
    tenorDays: 30,
    purpose: 'consumptive' as LoanPurpose,
  };

  test('non-positive contract principal throws rather than returning a verdict', () => {
    expect(() => calculateManfaatEkonomiRates(0, 800_000, 1_300_000, 30)).toThrow();
  });

  test('non-positive disbursement throws', () => {
    expect(() => evaluateRateCap({ ...ok, netDisbursed: 0 })).toThrow();
  });

  test('non-positive tenor throws', () => {
    expect(() => evaluateRateCap({ ...ok, tenorDays: 0 })).toThrow();
  });
});
