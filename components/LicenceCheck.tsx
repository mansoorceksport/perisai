'use client';

import React, { useState } from 'react';
import { Search, CheckCircle2, XCircle, AlertCircle, AlertTriangle, ArrowLeft, ExternalLink, FileText, HelpCircle } from 'lucide-react';
import { lookupLender } from '@/lib/lender-engine';
import { LenderLookupResult, Language } from '@/lib/types';
import { i18n } from '@/lib/i18n';

interface LicenceCheckProps {
  lang: Language;
  onBack: () => void;
  onOpenComplaint: (lenderName: string, status: string) => void;
  onSaveCase?: (type: 'lender_check', input: any, verdict: any) => void;
}

/**
 * Third-party APK mirrors. A licensed LPBBTI provider does not distribute
 * through these, so a blocklist row on one of them carrying a licensed brand is
 * the impersonation tell. `google_play` and `app_store` are deliberately absent:
 * they are official channels and would make the warning meaningless.
 */
const APK_MIRROR_CHANNELS = new Set([
  'softonic',
  'aptoide',
  'apkcombo',
  'apkpure',
  'apk_cafe',
  'sfile',
  'apksum',
  'uptodown',
]);

/** Names only the mirror channels actually present, never a generic list. */
function mirrorChannelsIn(listings: { channel: string }[]): string[] {
  return [...new Set(listings.map((l) => l.channel).filter((c) => APK_MIRROR_CHANNELS.has(c)))];
}

export function LicenceCheck({
  lang,
  onBack,
  onOpenComplaint,
  onSaveCase,
}: LicenceCheckProps) {
  const t = i18n[lang].licence;
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<LenderLookupResult | null>(null);

  const handleSearch = (searchQuery: string) => {
    const q = searchQuery.trim();
    if (!q) return;

    const res = lookupLender(q);
    setResult(res);

    if (onSaveCase) {
      onSaveCase('lender_check', { query: q }, res);
    }
  };

  const sampleQueries = ['Danamas', 'DanaKu', 'Kredivo', 'Uang Cepat', 'Platform TaTa'];

  return (
    <div id="licence-check-screen" className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          id="licence-back-btn"
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

      {/* Single centred column until there is a verdict; search left / verdict
          right once there is, so the query stays visible beside the finding. */}
      <div
        className={
          result
            ? 'space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(400px,460px)_minmax(0,1fr)] lg:gap-6'
            : 'space-y-4 lg:max-w-[640px] lg:mx-auto'
        }
      >
        {/* ---------- SEARCH COLUMN ---------- */}
        <div>
        <div className="lg:sticky lg:top-6">
      {/* Search Input Box */}
      <div className="p-4 bg-white rounded-2xl border border-[#E5E2D9] shadow-xs space-y-3">
        <div>
          <label htmlFor="lender-search-input" className="block text-xs font-semibold text-[#2C362F] mb-1.5">
            {t.input_label}
          </label>
          <div className="relative">
            <input
              id="lender-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(query)}
              placeholder={t.input_placeholder}
              className="w-full pl-9 pr-3 py-2.5 bg-[#FAF9F6] border border-[#E5E2D9] rounded-xl text-xs text-[#2C362F] focus:outline-hidden focus:ring-2 focus:ring-[#4A5D4E] focus:bg-white transition-all"
            />
            <Search className="w-4 h-4 text-[#6B7280] absolute left-3 top-3" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-[#6B7280] font-medium">{lang === 'id' ? 'Contoh:' : 'Samples:'}</span>
            {sampleQueries.map((item) => (
              <button
                key={item}
                id={`sample-query-${item.toLowerCase().replace(/\s+/g, '-')}`}
                type="button"
                onClick={() => {
                  setQuery(item);
                  handleSearch(item);
                }}
                className="px-2 py-0.5 text-[11px] bg-[#F0F4F1] hover:bg-[#E8EDEA] text-[#4A5D4E] rounded-md font-medium transition-colors cursor-pointer"
              >
                {item}
              </button>
            ))}
          </div>
          <button
            id="lender-submit-search-btn"
            type="button"
            onClick={() => handleSearch(query)}
            disabled={!query.trim()}
            className="px-4 py-2 bg-[#4A5D4E] hover:bg-[#3D4D40] disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors shrink-0 cursor-pointer shadow-xs"
          >
            {t.search_button}
          </button>
        </div>
        <p className="text-[11px] text-[#6B7280] italic leading-normal">{t.exact_match_note}</p>
      </div>
        </div>
        </div>

      {/* ---------- VERDICT COLUMN ---------- */}
      {result && (
        <div id="lender-result-container" className="space-y-3">
          {/* VERDICT: LICENSED (Green) */}
          {result.status === 'LICENSED' && result.licensed_data && (
            <div
              id="verdict-licensed-card"
              className="p-4 bg-emerald-50/90 border border-emerald-300 rounded-xl space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <span className="inline-block px-2 py-0.5 rounded-sm bg-emerald-700 text-white text-[10px] font-bold tracking-wide uppercase mb-1">
                    {t.verdict_licensed_badge}
                  </span>
                  <h2 className="text-sm font-bold text-emerald-950 leading-tight">
                    {t.verdict_licensed_title}
                  </h2>
                </div>
              </div>

              <div className="bg-white/80 p-3 rounded-lg border border-emerald-200 text-xs space-y-1.5 text-slate-800">
                <div className="flex justify-between border-b border-emerald-100 pb-1">
                  <span className="text-slate-600">{t.company_name}:</span>
                  <span className="font-semibold text-right">{result.licensed_data.company_name}</span>
                </div>
                <div className="flex justify-between border-b border-emerald-100 pb-1">
                  <span className="text-slate-600">{t.platform_name}:</span>
                  <span className="font-semibold text-right">{result.licensed_data.platform_name}</span>
                </div>
                <div className="flex justify-between border-b border-emerald-100 pb-1">
                  <span className="text-slate-600">{t.license_number}:</span>
                  <span className="font-mono text-right">{result.licensed_data.license_number}</span>
                </div>
                <div className="flex justify-between border-b border-emerald-100 pb-1">
                  <span className="text-slate-600">{t.license_date}:</span>
                  <span className="text-right">{result.licensed_data.license_date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">{t.website}:</span>
                  <a
                    href={result.licensed_data.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 underline font-medium flex items-center gap-1 text-right"
                  >
                    <span>{result.licensed_data.website.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
              </div>

              <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 leading-relaxed">
                {t.licensed_warning}
              </div>
            </div>
          )}

          {/* VERDICT: BLOCKED (Red) */}
          {result.status === 'BLOCKED' && result.blocked_data && (
            <div
              id="verdict-blocked-card"
              className="p-4 bg-red-50/90 border border-red-300 rounded-xl space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <XCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                <div>
                  <span className="inline-block px-2 py-0.5 rounded-sm bg-red-700 text-white text-[10px] font-bold tracking-wide uppercase mb-1">
                    {t.verdict_blocked_badge}
                  </span>
                  <h2 className="text-sm font-bold text-red-950 leading-tight">
                    {t.verdict_blocked_title}
                  </h2>
                </div>
              </div>

              <div className="bg-white/80 p-3 rounded-lg border border-red-200 text-xs space-y-1.5 text-slate-800">
                <p className="text-red-950 font-medium">{t.blocked_reason}</p>
                <div className="flex justify-between border-b border-red-100 pb-1 pt-1">
                  <span className="text-slate-600">{t.blocked_channel}:</span>
                  <span className="font-semibold uppercase text-right">{result.blocked_data.channel}</span>
                </div>
                {result.blocked_data.developer && (
                  <div className="flex justify-between border-b border-red-100 pb-1">
                    <span className="text-slate-600">{t.blocked_developer}:</span>
                    <span className="text-right font-medium">{result.blocked_data.developer}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">{lang === 'id' ? 'Periode Pemblokiran:' : 'Blocklist Period:'}</span>
                  <span className="font-mono text-right">{result.blocked_data.blocked_date}</span>
                </div>
              </div>

              <div className="p-3 bg-white rounded-lg border border-red-200 space-y-2">
                <p className="text-xs text-slate-700 font-medium leading-relaxed">
                  {t.blocked_action_prompt}
                </p>
                <button
                  id="blocked-generate-complaint-btn"
                  type="button"
                  onClick={() => onOpenComplaint(result.blocked_data?.name || result.query, 'BLOCKED / ILEGAL')}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>{t.create_complaint_btn}</span>
                </button>
              </div>
            </div>
          )}

          {/* VERDICT: CONTESTED — the name matches both registries.
              Deliberately not green and not red. Green would lend the
              impersonator the licensed company's credentials; red would accuse
              a licensed company of an impersonator's conduct. The licensed
              entity is licensed; only the name is contested. */}
          {result.status === 'CONTESTED' && result.licensed_data && result.blocked_listings && (
            <div
              id="verdict-contested-card"
              className="p-4 bg-orange-50/90 border border-orange-300 rounded-xl space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-orange-700 shrink-0 mt-0.5" />
                <div>
                  <span className="inline-block px-2 py-0.5 rounded-sm bg-orange-600 text-white text-[10px] font-bold tracking-wide uppercase mb-1">
                    {t.verdict_contested_badge}
                  </span>
                  <h2 className="text-sm font-bold text-orange-950 leading-tight">
                    {t.verdict_contested_title}
                  </h2>
                </div>
              </div>

              {/* Resolution leads, before either record. */}
              <div className="bg-white p-3.5 rounded-lg border border-orange-200 text-xs space-y-2 text-slate-800">
                <p className="font-medium text-slate-900 leading-relaxed">{t.contested_lead}</p>
                <h3 className="text-xs font-bold text-slate-900 pt-0.5">{t.contested_resolve_title}</h3>
                <ol className="list-decimal pl-4 space-y-1.5 text-slate-700 leading-relaxed marker:font-bold marker:text-orange-700">
                  <li>{t.contested_resolve_1}</li>
                  <li>{t.contested_resolve_2}</li>
                </ol>
              </div>

              {/* Both records, side by side from sm up. Never one without the other. */}
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <h3 className="font-bold text-emerald-900 leading-tight">{t.contested_licensed_heading}</h3>
                  </div>
                  <div className="space-y-1 pt-0.5 text-slate-800">
                    <div className="flex justify-between gap-2 border-b border-emerald-200/70 pb-1">
                      <span className="text-slate-600 shrink-0">{t.company_name}:</span>
                      <span className="font-semibold text-right">{result.licensed_data.company_name}</span>
                    </div>
                    <div className="flex justify-between gap-2 border-b border-emerald-200/70 pb-1">
                      <span className="text-slate-600 shrink-0">{t.license_number}:</span>
                      <span className="font-mono text-right break-all">{result.licensed_data.license_number}</span>
                    </div>
                    {result.licensed_data.website && (
                      <a
                        href={result.licensed_data.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 pt-0.5 text-emerald-800 hover:text-emerald-900 font-semibold break-all"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span>{result.licensed_data.website.replace(/^https?:\/\//, '')}</span>
                      </a>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-red-50 border border-red-300 rounded-lg space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5 text-red-700 shrink-0" />
                    <h3 className="font-bold text-red-900 leading-tight">{t.contested_blocked_heading}</h3>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{t.contested_blocked_note}</p>
                  <ul className="space-y-1.5 pt-0.5">
                    {result.blocked_listings.map((listing, idx) => (
                      <li
                        key={`${listing.name}-${listing.channel}-${idx}`}
                        className="border-b border-red-200/70 pb-1.5 last:border-0 last:pb-0"
                      >
                        <p className="font-medium text-slate-900 leading-snug break-words">{listing.name}</p>
                        <p className="text-[11px] text-slate-600">
                          {t.blocked_channel}:{' '}
                          <span className="font-semibold uppercase text-red-800">{listing.channel}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="text-[11px] text-orange-950 bg-orange-100/70 border border-orange-200 rounded-lg p-2.5 leading-relaxed">
                {mirrorChannelsIn(result.blocked_listings).length > 0
                  ? t.contested_channel_warning.replace(
                      '{channels}',
                      mirrorChannelsIn(result.blocked_listings).join(', ')
                    )
                  : t.contested_channel_warning_other}
              </p>

              {/* No complaint action here, by design — see contested_no_complaint_note. */}
              <div className="p-3 bg-white rounded-lg border border-orange-200 space-y-2">
                <h3 className="text-xs font-bold text-slate-900">{t.contested_action_title}</h3>
                <p className="text-[11px] text-slate-600 leading-relaxed">{t.contested_no_complaint_note}</p>
                <div className="flex gap-2 pt-1">
                  <a
                    id="contested-call-ojk-btn"
                    href="tel:157"
                    className="flex-1 text-center py-1.5 px-2.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
                  >
                    {lang === 'id' ? 'Telepon OJK 157' : 'Call OJK 157'}
                  </a>
                  <a
                    id="contested-wa-ojk-btn"
                    href="https://wa.me/6281157157157"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center py-1.5 px-2.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors"
                  >
                    WhatsApp OJK
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* VERDICT: NOT FOUND (Amber, Never Red - Directive 1.1 & C5) */}
          {result.status === 'NOT FOUND' && (
            <div
              id="verdict-not-found-card"
              className="p-4 bg-amber-50/90 border border-amber-300 rounded-xl space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="inline-block px-2 py-0.5 rounded-sm bg-amber-600 text-white text-[10px] font-bold tracking-wide uppercase mb-1">
                    {t.verdict_not_found_badge}
                  </span>
                  <h2 className="text-sm font-bold text-amber-950 leading-tight">
                    {t.verdict_not_found_title}
                  </h2>
                </div>
              </div>

              <div className="bg-white/80 p-3.5 rounded-lg border border-amber-200 text-xs space-y-2 text-slate-800">
                <p className="font-medium text-slate-900 leading-relaxed">
                  {t.not_found_explanation}
                </p>
                <ul className="list-disc pl-4 space-y-1 text-slate-600">
                  <li>{t.not_found_reason_1}</li>
                  <li>{t.not_found_reason_2}</li>
                  <li>{t.not_found_reason_3}</li>
                  <li>{t.not_found_reason_4}</li>
                </ul>
              </div>

              <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-2">
                <h3 className="text-xs font-bold text-slate-900">{t.not_found_action_title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{t.not_found_action_desc}</p>
                <div className="flex gap-2 pt-1">
                  <a
                    id="not-found-call-ojk-btn"
                    href="tel:157"
                    className="flex-1 text-center py-1.5 px-2.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
                  >
                    {lang === 'id' ? 'Telepon OJK 157' : 'Call OJK 157'}
                  </a>
                  <a
                    id="not-found-wa-ojk-btn"
                    href="https://wa.me/6281157157157"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center py-1.5 px-2.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors"
                  >
                    WhatsApp OJK
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* VERDICT: AMBIGUOUS / CLOSE MATCH (C6) */}
          {result.status === 'AMBIGUOUS' && result.candidates && (
            <div
              id="verdict-ambiguous-card"
              className="p-4 bg-slate-100 border border-slate-300 rounded-xl space-y-3"
            >
              <div className="flex items-start gap-2">
                <HelpCircle className="w-5 h-5 text-slate-700 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {result.candidates.some((c) => c.type === 'blocked')
                      ? t.ambiguous_blocked_title
                      : t.ambiguous_title}
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {result.candidates.some((c) => c.type === 'blocked')
                      ? t.ambiguous_blocked_desc
                      : t.ambiguous_desc}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                {result.candidates.map((c, i) => (
                  <button
                    key={i}
                    id={`ambiguous-candidate-${i}`}
                    type="button"
                    onClick={() => {
                      setQuery(c.name);
                      handleSearch(c.name);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                      c.type === 'blocked'
                        ? 'bg-white hover:bg-red-50/60 border-red-200'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <span className="font-bold text-slate-900 block break-words">
                      {c.name}
                      {c.type === 'blocked' && (
                        <span className="ml-1.5 align-middle inline-block px-1.5 py-0.5 rounded-sm bg-red-100 text-red-800 text-[9px] font-bold uppercase tracking-wide">
                          {t.ambiguous_blocked_tag}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-slate-600 block">{c.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
