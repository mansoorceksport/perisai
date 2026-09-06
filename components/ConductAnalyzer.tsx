'use client';

import React, { useState } from 'react';
import { ArrowLeft, ShieldAlert, CheckCircle2, AlertTriangle, Send, FileText, Lock, MessageSquare } from 'lucide-react';
import { getCurrentUserToken } from '@/lib/firebase-client';
import { escapeRegExp } from '@/lib/utils';
import { ConductViolation, Language } from '@/lib/types';
import { i18n } from '@/lib/i18n';

interface ConductAnalyzerProps {
  lang: Language;
  onBack: () => void;
  onOpenComplaint: (lenderName: string, status: string, violations: ConductViolation[], evidenceText: string) => void;
  onSaveCase?: (type: 'conduct_check', input: any, verdict: any) => void;
}

/**
 * Escapes HTML characters before wrapping spans (Directive 3 / OWASP A03 / LLM05)
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function ConductAnalyzer({
  lang,
  onBack,
  onOpenComplaint,
  onSaveCase,
}: ConductAnalyzerProps) {
  const t = i18n[lang].conduct;

  const [message, setMessage] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [violations, setViolations] = useState<ConductViolation[] | null>(null);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Follow-up state
  const [followupQuestion, setFollowupQuestion] = useState('');
  const [followupAnswer, setFollowupAnswer] = useState<string | null>(null);
  const [askingFollowup, setAskingFollowup] = useState(false);

  const sampleMessages = [
    {
      label: lang === 'id' ? 'Contoh Sebar Kontak & Ancaman' : 'Threat & Contact Leak Sample',
      text: 'WOI BANGSAT! Bayar utang lu hari ini atau semua foto KTP sama nomor HP lu gw broadcast ke seluruh kontak HP dan grup kantor lu biar malu satu kampung!',
    },
    {
      label: lang === 'id' ? 'Contoh Teror Spam & Intimidasi' : 'Harassment & Spam Sample',
      text: 'Anjing lu jangan kabur, saya tunggu 15 menit kalau tidak ada transfer saya spam telepon 24 jam nonstop dan orang tua lu gw tagih langsung!',
    },
    {
      label: lang === 'id' ? 'Contoh Pesan Wajar (Sesuai Aturan)' : 'Compliant Polite Reminder',
      text: 'Yth. Nasabah, kami mengingatkan kewajiban pinjaman Anda jatuh tempo hari ini sebesar Rp500.000. Silakan lakukan pembayaran melalui virtual account resmi di aplikasi. Terima kasih.',
    },
  ];

  const handleAnalyze = async (textToAnalyze = message) => {
    setError(null);
    const trimmed = textToAnalyze.trim();
    if (!trimmed) {
      setError(lang === 'en' ? 'Please paste message text first.' : 'Silakan tempel teks pesan penagihan terlebih dahulu.');
      return;
    }

    setAnalyzing(true);
    setViolations(null);
    setSummary('');
    setFollowupAnswer(null);

    try {
      // Fetched per call rather than held: Firebase rotates the ID token, and
      // a stale one is rejected by the route guard.
      const token = await getCurrentUserToken();
      const res = await fetch('/api/conduct/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: trimmed, lang }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze collection message.');
      }

      setViolations(data.matched_rules || []);
      setSummary(data.summary || '');

      if (onSaveCase) {
        onSaveCase('conduct_check', { message: trimmed }, data);
      }
    } catch (err: any) {
      setError(err?.message || 'Error occurred during analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAskFollowup = async () => {
    if (!followupQuestion.trim()) return;
    setAskingFollowup(true);

    try {
      const token = await getCurrentUserToken();
      const res = await fetch('/api/conduct/followup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question: followupQuestion.trim(),
          violations: violations || [],
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get follow-up answer.');
      }
      setFollowupAnswer(data.answer);
    } catch (err: any) {
      setError(err?.message || 'Error asking follow-up question.');
    } finally {
      setAskingFollowup(false);
    }
  };

  /**
   * Safely renders highlighted text by escaping first, then wrapping matched spans.
   */
  const renderHighlightedMessage = () => {
    const escaped = escapeHtml(message);
    if (!violations || violations.length === 0) {
      return <span dangerouslySetInnerHTML={{ __html: escaped }} />;
    }

    let resultHtml = escaped;
    for (const v of violations) {
      if (v.matched_phrase && v.matched_phrase.trim().length > 2) {
        // Both escapes, in this order. HTML-escape so the needle matches the
        // already-escaped haystack; regex-escape so metacharacters in text the
        // collector wrote are matched literally instead of changing the
        // pattern. Omitting the second throws on an unbalanced `(` or `[`, and
        // silently mis-highlights on a `.`.
        const escapedPhrase = escapeRegExp(escapeHtml(v.matched_phrase.trim()));
        const regex = new RegExp(`(${escapedPhrase})`, 'gi');
        resultHtml = resultHtml.replace(
          regex,
          '<mark class="bg-red-200 text-red-950 font-bold px-1 rounded-sm">$1</mark>'
        );
      }
    }

    return <span dangerouslySetInnerHTML={{ __html: resultHtml }} />;
  };

  const hasResults = violations !== null;

  return (
    <div id="conduct-analyzer-screen" className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          id="conduct-back-btn"
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

      {/* Before analysis the form is a single centred column — a lone input
          stranded on the left of a wide screen reads as broken. Once there are
          findings, it becomes evidence left / findings right so the message
          stays on screen while the violations are read. */}
      <div
        className={
          hasResults
            ? 'space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(440px,500px)_minmax(0,1fr)] lg:gap-6'
            : 'space-y-4 lg:max-w-[640px] lg:mx-auto'
        }
      >
        {/* ---------- EVIDENCE COLUMN ---------- */}
        <div>
        <div className="space-y-4 lg:sticky lg:top-6">
      {/* Preset Buttons */}
      <div className="space-y-1.5">
        <span className="text-[11px] text-[#6B7280] font-semibold block">{lang === 'id' ? 'Uji Contoh Pesan:' : 'Test Sample Messages:'}</span>
        <div className="flex flex-col gap-1.5">
          {sampleMessages.map((s, idx) => (
            <button
              key={idx}
              id={`conduct-sample-btn-${idx}`}
              type="button"
              onClick={() => {
                setMessage(s.text);
                handleAnalyze(s.text);
              }}
              className="text-left px-3 py-2 text-xs bg-[#FAF9F6] hover:bg-[#F0F4F1] text-[#2C362F] rounded-xl border border-[#E5E2D9] font-medium transition-colors cursor-pointer"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message Input Box */}
      <div className="p-4 bg-white rounded-2xl border border-[#E5E2D9] shadow-xs space-y-3">
        <div>
          <label htmlFor="collection-message-input" className="block text-xs font-semibold text-[#2C362F] mb-1.5">
            {t.input_label}
          </label>
          <textarea
            id="collection-message-input"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t.input_placeholder}
            className="w-full p-3 bg-[#FAF9F6] border border-[#E5E2D9] rounded-xl text-xs text-[#2C362F] focus:outline-hidden focus:ring-2 focus:ring-[#4A5D4E] focus:bg-white leading-relaxed resize-y transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-[#6B7280]">
          <Lock className="w-3.5 h-3.5 text-[#4A5D4E] shrink-0" />
          <span>{t.privacy_note}</span>
        </div>

        {error && (
          <div id="conduct-error-box" className="p-2.5 rounded-xl bg-[#FEF3F2] border border-[#FEE2E2] text-xs text-[#991B1B]">
            {error}
          </div>
        )}

        <button
          id="conduct-analyze-submit-btn"
          type="button"
          onClick={() => handleAnalyze()}
          disabled={analyzing || !message.trim()}
          className="w-full py-2.5 bg-[#4A5D4E] hover:bg-[#3D4D40] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
        >
          {analyzing ? (
            <span>{t.analyzing}</span>
          ) : (
            <>
              <ShieldAlert className="w-4 h-4 text-[#F0F4F1]" />
              <span>{t.analyze_btn}</span>
            </>
          )}
        </button>
      </div>
        </div>
        </div>

      {/* ---------- FINDINGS COLUMN ---------- */}
      {violations !== null && (
        <div id="conduct-analysis-results-card" className="space-y-3">
          {/* Safe Span Highlight Box */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs leading-relaxed text-slate-800">
            <span className="text-[11px] font-bold text-slate-600 block mb-1 uppercase tracking-wide">
              {lang === 'id' ? 'Teks Pesan Teranalisis:' : 'Analyzed Message Text:'}
            </span>
            <div className="p-2 bg-white rounded-lg border border-slate-200 font-mono text-xs whitespace-pre-wrap break-words">
              {renderHighlightedMessage()}
            </div>
          </div>

          {violations.length > 0 ? (
            <div className="p-4 bg-red-50/90 border border-red-300 rounded-xl space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                <div>
                  <span className="inline-block px-2 py-0.5 rounded-sm bg-red-700 text-white text-[10px] font-bold tracking-wide uppercase mb-1">
                    {violations.length} {lang === 'id' ? 'Pelanggaran Ditemukan' : 'Violations Found'}
                  </span>
                  <h2 className="text-sm font-bold text-red-950 leading-tight">
                    {t.violations_found}
                  </h2>
                </div>
              </div>

              {summary && <p className="text-xs text-slate-700 font-medium">{summary}</p>}

              {/* Violations List — two up once the column is wide enough,
                  so findings stay scannable instead of becoming long lines. */}
              <div className="space-y-2.5 pt-1 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-2.5 xl:items-start">
                {violations.map((v, i) => (
                  <div
                    key={i}
                    id={`violation-item-${i}`}
                    className="p-3 bg-white/90 rounded-lg border border-red-200 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{v.title}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold uppercase ${
                          v.severity === 'critical'
                            ? 'bg-red-700 text-white'
                            : v.severity === 'high'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-200 text-slate-800'
                        }`}
                      >
                        {v.severity}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 font-mono">
                      {t.citation_label}: {v.citation}
                    </div>

                    {v.matched_phrase && (
                      <div className="p-2 rounded bg-red-50 text-red-900 border border-red-100 font-mono text-[11px]">
                        <span className="font-bold block text-[10px] uppercase text-red-800">
                          {t.matched_phrase_label}
                        </span>
                        &quot;{v.matched_phrase}&quot;
                      </div>
                    )}

                    <p className="text-slate-700 text-[11px] leading-relaxed">
                      {v.explanation}
                    </p>
                  </div>
                ))}
              </div>

              {/* Immediate Steps Guide */}
              <div className="p-3 bg-white rounded-lg border border-red-200 text-xs space-y-1.5">
                <h3 className="font-bold text-slate-900">{t.remedy_title}</h3>
                <ul className="list-decimal pl-4 space-y-1 text-slate-700 text-[11px]">
                  <li>{t.remedy_1}</li>
                  <li>{t.remedy_2}</li>
                  <li>{t.remedy_3}</li>
                </ul>
              </div>

              {/* Draft Complaint CTA */}
              <button
                id="conduct-create-complaint-btn"
                type="button"
                onClick={() =>
                  onOpenComplaint(
                    'Penyelenggara Pinjol Terlapor',
                    'PELANGGARAN PENAGIHAN KASAR / INTIMIDASI',
                    violations,
                    message
                  )
                }
                className="w-full py-2.5 px-3 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-2xs"
              >
                <FileText className="w-4 h-4" />
                <span>{t.make_complaint_btn}</span>
              </button>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50/90 border border-emerald-300 rounded-xl space-y-2">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <span className="inline-block px-2 py-0.5 rounded-sm bg-emerald-700 text-white text-[10px] font-bold tracking-wide uppercase mb-1">
                    {lang === 'id' ? 'Etika Standar' : 'Standard Tone'}
                  </span>
                  <p className="text-xs text-slate-800 leading-relaxed font-medium">
                    {t.no_violations_detected}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Follow-up Q&A Section */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-slate-700 shrink-0" />
              <h3 className="text-xs font-bold text-slate-900">{t.followup_title}</h3>
            </div>

            <div className="flex gap-2">
              <input
                id="followup-question-input"
                type="text"
                value={followupQuestion}
                onChange={(e) => setFollowupQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAskFollowup()}
                placeholder={t.followup_placeholder}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white"
              />
              <button
                id="followup-submit-btn"
                type="button"
                onClick={handleAskFollowup}
                disabled={askingFollowup || !followupQuestion.trim()}
                className="p-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg transition-colors shrink-0"
                title={t.followup_btn}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>

            {askingFollowup && (
              <p className="text-[11px] text-slate-600 italic">{t.followup_asking}</p>
            )}

            {followupAnswer && (
              <div
                id="followup-answer-box"
                className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed space-y-2"
              >
                <span className="font-bold text-slate-900 block border-b border-slate-200 pb-1">
                  {lang === 'id' ? 'Rekomendasi Langkah Berdasarkan Aturan:' : 'Guidance Grounded in Rules:'}
                </span>
                {followupAnswer}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
