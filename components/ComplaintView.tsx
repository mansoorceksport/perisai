'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Copy, Check, Download, Mail, Phone, FileText, Send } from 'lucide-react';
import { getCurrentUserToken } from '@/lib/firebase-client';
import { ConductViolation, Language } from '@/lib/types';
import { i18n } from '@/lib/i18n';

interface ComplaintViewProps {
  lang: Language;
  onBack: () => void;
  initialLenderName?: string;
  initialLenderStatus?: string;
  initialViolations?: ConductViolation[];
  initialEvidenceText?: string;
}

interface ComplaintDraftPayload {
  lender_name: string;
  lender_status: string;
  violations: ConductViolation[];
  evidence_text: string;
  remedy: string;
  lang: Language;
}

/**
 * Requests a draft. Holds no React state, so callers set their own loading and
 * result state from the promise callbacks — which keeps setState out of the
 * synchronous body of the mount effect.
 */
async function requestComplaintDraft(payload: ComplaintDraftPayload): Promise<string | null> {
  // Fetched per call rather than held: Firebase rotates the ID token, and a
  // stale one is rejected by the route guard.
  const token = await getCurrentUserToken();
  const res = await fetch('/api/complaint/draft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to generate complaint draft.');
  }
  return typeof data?.draft_text === 'string' ? data.draft_text : null;
}

export function ComplaintView({
  lang,
  onBack,
  initialLenderName = '',
  initialLenderStatus = '',
  initialViolations = [],
  initialEvidenceText = '',
}: ComplaintViewProps) {
  const t = i18n[lang].complaint;

  const [lenderName, setLenderName] = useState(initialLenderName);
  const [lenderStatus, setLenderStatus] = useState(initialLenderStatus);
  const [remedy, setRemedy] = useState(
    'Penghentian penagihan intimidatif, penghapusan denda tidak sah, dan penindakan tegas sesuai peraturan OJK'
  );
  const [draftText, setDraftText] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Tracks the newest in-flight generation so a superseded response cannot
  // overwrite a newer draft.
  const requestSeqRef = useRef(0);

  const buildPayload = () => ({
    lender_name: lenderName || 'Platform Pinjaman Terkait',
    lender_status: lenderStatus || 'TIDAK TERDAFTAR / BLOKIR',
    violations: initialViolations,
    evidence_text: initialEvidenceText,
    remedy,
    lang,
  });

  const generateDraft = () => {
    setLoading(true);
    const seq = ++requestSeqRef.current;
    requestComplaintDraft(buildPayload())
      .then((text) => {
        if (seq !== requestSeqRef.current) return;
        if (text) setDraftText(text);
      })
      .catch((err) => console.error('Error fetching complaint draft:', err))
      .finally(() => {
        if (seq === requestSeqRef.current) setLoading(false);
      });
  };

  // Generate the opening draft exactly once, on mount.
  //
  // This effect previously depended on lenderName / lenderStatus / remedy /
  // initialViolations. The first three are fields the user types into and the
  // last is a fresh array identity on every render, so every single keystroke
  // fired a Gemini generation request — against an endpoint that performs no
  // token verification and is deployed --allow-unauthenticated.
  //
  // `lang` is deliberately not a dependency either. The draft is editable and
  // the user may have already amended it; regenerating on a language toggle
  // would silently discard their edits. Regeneration is always the explicit
  // "Perbarui Format Surat" button.
  //
  // `loading` is initialised to true, so the mount path sets no state up front;
  // state is only written from the promise callbacks below.
  useEffect(() => {
    let cancelled = false;
    const seq = ++requestSeqRef.current;

    requestComplaintDraft({
      lender_name: initialLenderName || 'Platform Pinjaman Terkait',
      lender_status: initialLenderStatus || 'TIDAK TERDAFTAR / BLOKIR',
      violations: initialViolations,
      evidence_text: initialEvidenceText,
      remedy,
      lang,
    })
      .then((text) => {
        if (cancelled || seq !== requestSeqRef.current) return;
        if (text) setDraftText(text);
      })
      .catch((err) => console.error('Error fetching complaint draft:', err))
      .finally(() => {
        if (!cancelled && seq === requestSeqRef.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Mount-only by design — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = () => {
    if (!draftText) return;
    navigator.clipboard.writeText(draftText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    if (!draftText) return;
    const blob = new Blob([draftText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Surat_Pengaduan_OJK_${lenderName.replace(/\s+/g, '_') || 'Pinjol'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="complaint-view-screen" className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          id="complaint-back-btn"
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-md hover:bg-slate-200/70 text-slate-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900 leading-tight">{t.title}</h1>
          <p className="text-xs text-slate-600">{t.subtitle}</p>
        </div>
      </div>

      {/* Controls left, the letter and its destinations right. The letter is the
          artifact the user leaves with, so it gets the wide column and a taller
          editing area on desktop. Source order is unchanged, so the mobile stack
          stays controls → letter → where to send it. */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)] lg:gap-6">
        {/* ---------- CONTROLS COLUMN ---------- */}
        <div>
        <div className="space-y-4 lg:sticky lg:top-6">
      {/* Meta Input details */}
      <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2.5 text-xs">
        <div>
          <label htmlFor="complaint-lender-name-input" className="block font-semibold text-slate-700 mb-1">
            {lang === 'id' ? 'Nama Platform / PT Terlapor:' : 'Reported Lender Name:'}
          </label>
          <input
            id="complaint-lender-name-input"
            type="text"
            value={lenderName}
            onChange={(e) => setLenderName(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
          />
        </div>

        <div>
          <label htmlFor="complaint-remedy-input" className="block font-semibold text-slate-700 mb-1">
            {t.remedy_field}:
          </label>
          <input
            id="complaint-remedy-input"
            type="text"
            value={remedy}
            onChange={(e) => setRemedy(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
          />
        </div>

        <button
          id="complaint-regenerate-btn"
          type="button"
          onClick={generateDraft}
          disabled={loading}
          className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg transition-colors text-xs flex items-center justify-center gap-1.5"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{loading ? (lang === 'id' ? 'Menyiapkan draf...' : 'Generating draft...') : (lang === 'id' ? 'Perbarui Format Surat' : 'Regenerate Draft')}</span>
        </button>
      </div>

        </div>
        </div>

      {/* ---------- LETTER COLUMN ---------- */}
      <div className="space-y-4">
      {/* Draft Text Card */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
          <span className="text-xs font-bold text-slate-900">{t.body_label}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id="copy-complaint-draft-btn"
              type="button"
              onClick={handleCopy}
              disabled={!draftText}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t.copied : t.copy_btn}</span>
            </button>
            <button
              id="download-complaint-draft-btn"
              type="button"
              onClick={handleDownload}
              disabled={!draftText}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.download_btn}</span>
            </button>
          </div>
        </div>

        <textarea
          id="complaint-draft-textarea"
          rows={12}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder={lang === 'id' ? 'Menyiapkan draf pengaduan...' : 'Preparing complaint draft...'}
          className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white resize-y lg:min-h-[620px]"
        />

        <p className="text-[11px] text-slate-600 italic leading-relaxed">
          {lang === 'id'
            ? '*Edit bagian dalam tanda kurung siku seperti [NAMA LENGKAP], [NOMOR KTP], [NOMOR TELEPON] dengan data Anda sebelum dikirimkan.'
            : '*Personalize bracketed placeholders like [FULL NAME], [ID NUMBER], [PHONE NUMBER] before sending.'}
        </p>
      </div>

      {/* Submission Channels Card */}
      <div className="p-4 bg-slate-900 text-white rounded-xl shadow-2xs space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wide">
          {t.destinations_title}
        </h3>
        <p className="text-[11px] text-slate-300 leading-relaxed">{t.instructions}</p>

        <div className="space-y-2 pt-1 text-xs">
          <a
            id="send-email-satgas-btn"
            href={`mailto:satgaspasti@ojk.go.id?subject=${encodeURIComponent(
              `[Pengaduan Pinjol] - ${lenderName || 'Pinjaman Online'}`
            )}&body=${encodeURIComponent(draftText.slice(0, 1500))}`}
            className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700/90 border border-slate-700 text-white font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-red-400 shrink-0" />
              <span>{t.destination_satgas}</span>
            </span>
            <span className="text-[11px] text-slate-400">Email</span>
          </a>

          <a
            id="send-email-konsumen-btn"
            href={`mailto:konsumen@ojk.go.id?subject=${encodeURIComponent(
              `[Pengaduan Konsumen OJK] - ${lenderName || 'Pinjaman Online'}`
            )}&body=${encodeURIComponent(draftText.slice(0, 1500))}`}
            className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700/90 border border-slate-700 text-white font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-400 shrink-0" />
              <span>{t.destination_konsumen}</span>
            </span>
            <span className="text-[11px] text-slate-400">Email</span>
          </a>

          <a
            id="send-wa-ojk-btn"
            href="https://wa.me/6281157157157"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between p-2.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-200 font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{t.destination_wa}</span>
            </span>
            <span className="text-[11px] text-emerald-300">WA Chat</span>
          </a>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
