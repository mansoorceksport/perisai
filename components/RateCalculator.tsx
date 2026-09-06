'use client';

import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';
import { evaluateRateCap, formatRatePct } from '@/lib/rate-engine';
import { RateEvaluation, LoanPurpose, Language } from '@/lib/types';
import { i18n } from '@/lib/i18n';

interface RateCalculatorProps {
  lang: Language;
  onBack: () => void;
  onOpenComplaint?: (lenderName: string, status: string) => void;
  onSaveCase?: (type: 'rate_check', input: any, verdict: any) => void;
}

/**
 * Rupiah amounts are whole numbers, so the money fields hold digits only.
 * The displayed string carries id-ID thousands separators ("1.000.000");
 * parseMoney strips every non-digit so the engine always receives a plain
 * number. Display formatting never reaches the computation.
 */
function parseMoney(value: string): number {
  const digits = value.replace(/\D/g, '');
  return digits === '' ? NaN : Number(digits);
}

function formatMoney(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits === '' ? '' : Number(digits).toLocaleString('id-ID');
}

export function RateCalculator({
  lang,
  onBack,
  onOpenComplaint,
  onSaveCase,
}: RateCalculatorProps) {
  const t = i18n[lang].calculator;

  const [contractPrincipal, setContractPrincipal] = useState<string>(() => formatMoney('1000000'));
  const [netDisbursed, setNetDisbursed] = useState<string>(() => formatMoney('800000'));
  const [totalRepayment, setTotalRepayment] = useState<string>(() => formatMoney('1300000'));
  const [tenorDays, setTenorDays] = useState<string>('30');
  const [purpose, setPurpose] = useState<LoanPurpose>('consumptive');
  const [result, setResult] = useState<RateEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = (
    cVal = contractPrincipal,
    dVal = netDisbursed,
    rVal = totalRepayment,
    tVal = tenorDays,
    purpVal = purpose
  ) => {
    setError(null);
    const cNum = parseMoney(cVal);
    const dNum = parseMoney(dVal);
    const rNum = parseMoney(rVal);
    const tNum = parseInt(tVal.replace(/\D/g, ''), 10);

    // An input error is an input error. It must never be rendered as a
    // regulatory finding, so every guard clears the previous verdict.
    if (
      isNaN(cNum) || cNum <= 0 ||
      isNaN(dNum) || dNum <= 0 ||
      isNaN(rNum) || rNum <= 0 ||
      isNaN(tNum)
    ) {
      setResult(null);
      setError(t.validation_error);
      return;
    }
    if (tNum < 1) {
      setResult(null);
      setError(t.error_tenor_min);
      return;
    }
    if (dNum > cNum) {
      setResult(null);
      setError(t.error_disbursed_gt_contract);
      return;
    }
    if (rNum < dNum) {
      setResult(null);
      setError(t.error_repayment_lt_disbursed);
      return;
    }

    try {
      const res = evaluateRateCap({
        contractPrincipal: cNum,
        netDisbursed: dNum,
        totalRepayment: rNum,
        tenorDays: tNum,
        purpose: purpVal,
      });
      setResult(res);

      if (onSaveCase) {
        onSaveCase(
          'rate_check',
          {
            contractPrincipal: cNum,
            netDisbursed: dNum,
            totalRepayment: rNum,
            tenorDays: tNum,
            purpose: purpVal,
          },
          res
        );
      }
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'Error executing calculations.');
    }
  };

  const loadPreset = (
    c: string,
    d: string,
    r: string,
    tDays: string,
    purp: LoanPurpose
  ) => {
    setContractPrincipal(formatMoney(c));
    setNetDisbursed(formatMoney(d));
    setTotalRepayment(formatMoney(r));
    setTenorDays(tDays);
    setPurpose(purp);
    handleCalculate(c, d, r, tDays, purp);
  };

  const fieldClass =
    'w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white';
  const labelClass = 'block text-xs font-semibold text-slate-800 mb-1';
  const helpClass = 'text-[11px] text-slate-600 mt-1';

  const purposeBtnClass = (active: boolean) =>
    `py-2 px-2.5 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
      active
        ? 'bg-[#4A5D4E] text-white border-[#4A5D4E] shadow-2xs font-semibold'
        : 'bg-[#FAF9F6] hover:bg-[#F0F4F1] text-[#2C362F] border-[#E5E2D9]'
    }`;

  const perDay = lang === 'id' ? 'hari' : 'day';

  return (
    <div id="rate-calculator-screen" className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          id="rate-calculator-back-btn"
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-[#F0F4F1] text-[#6B7280] hover:text-[#2C362F] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-[#2C362F] leading-tight">{t.title}</h1>
          <p className="text-xs text-[#6B7280]">{t.subtitle}</p>
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[11px] text-slate-600 font-semibold">{lang === 'id' ? 'Uji Cepat:' : 'Quick Presets:'}</span>
        <button
          id="preset-predatory-btn"
          type="button"
          onClick={() => loadPreset('1000000', '800000', '1300000', '30', 'consumptive')}
          className="px-2 py-1 text-[11px] rounded bg-red-100/70 hover:bg-red-200/70 text-red-800 font-medium transition-colors"
        >
          {lang === 'id' ? 'Bunga Tinggi 30 Hari' : 'Predatory 30-Day'}
        </button>
        <button
          id="preset-compliant-btn"
          type="button"
          onClick={() => loadPreset('50000000', '50000000', '51250000', '150', 'productive')}
          className="px-2 py-1 text-[11px] rounded bg-emerald-100/70 hover:bg-emerald-200/70 text-emerald-800 font-medium transition-colors"
        >
          {lang === 'id' ? 'Contoh Resmi OJK (Wajar)' : 'SEOJK Example (Compliant)'}
        </button>
        <button
          id="preset-lockcap-btn"
          type="button"
          onClick={() => loadPreset('2000000', '2000000', '4500000', '90', 'consumptive')}
          className="px-2 py-1 text-[11px] rounded bg-amber-100/70 hover:bg-amber-200/70 text-amber-900 font-medium transition-colors"
        >
          {lang === 'id' ? 'Uji Batas 100% (XIV.5)' : 'Lock Cap Breach (>100%)'}
        </button>
      </div>

      {/* Inputs left, results right at lg+. Stacked below. The input column is
          held to ~500px so money rows stay scannable instead of spanning the
          full desktop surface. */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(480px,520px)_minmax(0,1fr)] lg:gap-6">
        {/* ---------- INPUT COLUMN ---------- */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3.5">
          {/* Money fields, grouped */}
          <div className="space-y-3.5">
            <div>
              <label htmlFor="contract-principal-input" className={labelClass}>
                {t.contract_principal_label} (Rp)
              </label>
              <input
                id="contract-principal-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={contractPrincipal}
                onChange={(e) => setContractPrincipal(formatMoney(e.target.value))}
                className={fieldClass}
                placeholder="1.000.000"
              />
              <p className={helpClass}>{t.contract_principal_help}</p>
            </div>

            <div>
              <label htmlFor="net-disbursed-input" className={labelClass}>
                {t.net_disbursed_label} (Rp)
              </label>
              <input
                id="net-disbursed-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={netDisbursed}
                onChange={(e) => setNetDisbursed(formatMoney(e.target.value))}
                className={fieldClass}
                placeholder="800.000"
              />
              <p className={helpClass}>{t.net_disbursed_help}</p>
            </div>

            <div>
              <label htmlFor="total-repaid-input" className={labelClass}>
                {t.total_repaid_label} (Rp)
              </label>
              <input
                id="total-repaid-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={totalRepayment}
                onChange={(e) => setTotalRepayment(formatMoney(e.target.value))}
                className={fieldClass}
                placeholder="1.300.000"
              />
              <p className={helpClass}>{t.total_repaid_help}</p>
            </div>
          </div>

          {/* Tenor and purpose share a row from sm up. */}
          <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-3">
            <div>
              <label htmlFor="tenor-input" className={labelClass}>
                {t.tenor_label}
              </label>
              <input
                id="tenor-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={tenorDays}
                onChange={(e) => setTenorDays(e.target.value.replace(/\D/g, ''))}
                className={fieldClass}
                placeholder="30"
              />
              <p className={helpClass}>{t.tenor_help}</p>
            </div>

            <div>
              <span className={labelClass}>{t.purpose_label}</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  id="purpose-consumptive-btn"
                  type="button"
                  onClick={() => setPurpose('consumptive')}
                  className={purposeBtnClass(purpose === 'consumptive')}
                >
                  {t.purpose_consumptive}
                </button>
                <button
                  id="purpose-productive-btn"
                  type="button"
                  onClick={() => setPurpose('productive')}
                  className={purposeBtnClass(purpose === 'productive')}
                >
                  {t.purpose_productive}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div id="rate-calc-error" className="p-2.5 rounded-xl bg-[#FEF3F2] border border-[#FEE2E2] text-xs text-[#991B1B]">
              {error}
            </div>
          )}

          <button
            id="rate-calculate-submit-btn"
            type="button"
            onClick={() => handleCalculate()}
            className="w-full py-2.5 bg-[#4A5D4E] hover:bg-[#3D4D40] text-white text-xs font-bold rounded-xl transition-colors shadow-2xs cursor-pointer"
          >
            {t.calculate_btn}
          </button>
        </div>

        {/* ---------- RESULTS COLUMN ----------
            The grid item stretches to the row height; sticky lives on the inner
            wrapper so it has travel whenever the input column is the taller of
            the two. Sticking it on the item itself gives it a zero-height
            range and it never engages. */}
        <div>
        <div className="space-y-3 lg:sticky lg:top-6">
          {/* Method statement. Not a live check — the vectors are asserted in
              lib/rate-engine.test.ts. */}
          <div id="method-badge-card" className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F0F4F1] border border-[#E5E2D9] text-[11px] text-[#4A5D4E]">
            <ShieldCheck className="w-4 h-4 text-[#4A5D4E] shrink-0" />
            <span className="font-medium">{t.method_badge}</span>
          </div>

          {result && (
            <div
              id="rate-calculation-result-card"
              className={`p-4 rounded-xl border space-y-3 ${
                result.status === 'compliant'
                  ? 'bg-emerald-50/90 border-emerald-300'
                  : result.status === 'exceeded'
                  ? 'bg-red-50/90 border-red-300'
                  : 'bg-amber-50/90 border-amber-300'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {result.status === 'compliant' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                ) : result.status === 'exceeded' ? (
                  <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                ) : (
                  <HelpCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                )}
                <div>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-sm text-white text-[10px] font-bold tracking-wide uppercase mb-1 ${
                      result.status === 'compliant'
                        ? 'bg-emerald-700'
                        : result.status === 'exceeded'
                        ? 'bg-red-700'
                        : 'bg-amber-600'
                    }`}
                  >
                    {result.status === 'compliant'
                      ? 'Wajar Sesuai Batas'
                      : result.status === 'exceeded'
                      ? 'Bunga Melampaui Batas'
                      : t.status_no_cap}
                  </span>
                  <h2 className="text-sm font-bold text-slate-900 leading-tight">
                    {result.status === 'compliant'
                      ? t.status_compliant
                      : result.status === 'exceeded'
                      ? t.status_exceeded
                      : t.status_no_cap_desc}
                  </h2>
                </div>
              </div>

              {/* Headline: the regulator's figure, and how far over the cap it is. */}
              <div className="bg-white/80 p-3 rounded-lg border border-slate-200 space-y-2">
                <div>
                  <span className="text-slate-600 block text-[11px]">{t.regulatory_rate_label}:</span>
                  <span
                    className={`text-2xl font-bold font-mono ${
                      result.status === 'exceeded' ? 'text-red-700' : 'text-slate-900'
                    }`}
                  >
                    {formatRatePct(result.regulatory_daily_pct)}% / {perDay}
                  </span>
                </div>
                {result.status === 'exceeded' && result.multiple_over_cap !== null && (
                  <div className="text-xs font-bold text-red-800">
                    {t.multiple_over_cap_label}: {result.multiple_over_cap.toFixed(1)}×
                  </div>
                )}
              </div>

              {/* Detail table. The experienced rate sits here, labelled, never
                  merged with the regulatory figure above. */}
              <div className="bg-white/80 p-3 rounded-lg border border-slate-200 text-xs space-y-1 text-slate-800">
                <div className="flex justify-between gap-3 border-b border-slate-100 pb-1">
                  <span className="text-slate-600">{t.manfaat_ekonomi_label}:</span>
                  <span className="font-semibold font-mono shrink-0">
                    Rp {result.total_manfaat_ekonomi.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-100 pb-1">
                  <span className="text-slate-600">{t.ojk_cap_label}:</span>
                  <span className="font-semibold font-mono shrink-0">
                    {result.cap_percent_per_day !== null
                      ? `${result.cap_percent_per_day}% / ${perDay}`
                      : '—'}
                  </span>
                </div>
                {result.citation && (
                  <div className="flex justify-between gap-3 border-b border-slate-100 pb-1">
                    <span className="text-slate-600">{lang === 'id' ? 'Dasar Hukum' : 'Citation'}:</span>
                    <span className="font-semibold font-mono shrink-0">{result.citation}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">{t.experienced_rate_label}:</span>
                  <span className="font-semibold font-mono shrink-0">
                    {formatRatePct(result.experienced_daily_pct)}% / {perDay}
                  </span>
                </div>
              </div>

              {/* Lock Cap Verification (Bab XIV.5). Rendered whether it passes
                  or breaches — a rule checked and cleared builds trust. */}
              <div
                id="lock-cap-status-box"
                className={`p-3 rounded-lg border text-xs leading-relaxed ${
                  result.lock_cap_status === 'breached'
                    ? 'bg-red-100/90 border-red-300 text-red-950 font-medium'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <span className="font-bold block mb-0.5">{t.lock_cap_title}</span>
                <p>
                  {result.lock_cap_status === 'breached' ? t.lock_cap_breached : t.lock_cap_ok}
                </p>
                <span className="text-[10px] text-slate-600 block mt-1">
                  {lang === 'id' ? 'Rujukan Hukum:' : 'Legal Citation:'} SEOJK 19/SEOJK.06/2025 {result.lock_cap_citation}
                </span>
              </div>

              {result.status === 'exceeded' && onOpenComplaint && (
                <button
                  id="rate-exceeded-complaint-btn"
                  type="button"
                  onClick={() =>
                    onOpenComplaint('Penyelenggara Pinjol (Pelanggaran Bunga)', 'BUNGA MELAMPAUI BATAS SEOJK')
                  }
                  className="w-full py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  {lang === 'id' ? 'Buat Draf Laporan Bunga Berlebih ke OJK' : 'Draft Rate Cap Complaint to OJK'}
                </button>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
