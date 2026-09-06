'use client';

import React from 'react';
import { History, Shield, Calculator, ShieldAlert, ChevronRight } from 'lucide-react';
import { CaseRecord, Language } from '@/lib/types';
import { i18n } from '@/lib/i18n';

interface CaseHistoryProps {
  lang: Language;
  cases: CaseRecord[];
  onSelectCase?: (caseItem: CaseRecord) => void;
}

export function CaseHistory({ lang, cases, onSelectCase }: CaseHistoryProps) {
  const t = i18n[lang].tasks;

  if (!cases || cases.length === 0) {
    return (
      <div id="case-history-empty" className="p-4 bg-white rounded-xl border border-[#E5E2D9] text-center space-y-1">
        <History className="w-5 h-5 text-[#6B7280] mx-auto mb-1" />
        <p className="text-xs font-semibold text-[#2C362F]">{t.recent_cases_title}</p>
        <p className="text-[11px] text-[#6B7280]">{t.no_cases}</p>
      </div>
    );
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'lender_check':
        return <Shield className="w-3.5 h-3.5 text-[#4A5D4E]" />;
      case 'rate_check':
        return <Calculator className="w-3.5 h-3.5 text-[#991B1B]" />;
      case 'conduct_check':
        return <ShieldAlert className="w-3.5 h-3.5 text-[#9A3412]" />;
      default:
        return <History className="w-3.5 h-3.5 text-[#6B7280]" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'lender_check':
        return lang === 'id' ? 'Cek Izin Pinjol' : 'Licence Check';
      case 'rate_check':
        return lang === 'id' ? 'Cek Batas Bunga' : 'Rate Cap Check';
      case 'conduct_check':
        return lang === 'id' ? 'Analisis Pesan' : 'Message Audit';
      default:
        return type;
    }
  };

  const getVerdictBadge = (item: CaseRecord) => {
    if (item.type === 'lender_check') {
      const status = typeof item.verdict?.status === 'string' ? item.verdict.status : '';
      return (
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
            status === 'LICENSED'
              ? 'bg-[#E8EDEA] text-[#4A5D4E]'
              : status === 'BLOCKED'
              ? 'bg-[#FEF3F2] text-[#991B1B]'
              : 'bg-[#FFF7ED] text-[#9A3412]'
          }`}
        >
          {status || 'Selesai'}
        </span>
      );
    }
    if (item.type === 'rate_check') {
      const status = typeof item.verdict?.status === 'string' ? item.verdict.status : '';
      return (
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
            status === 'compliant'
              ? 'bg-[#E8EDEA] text-[#4A5D4E]'
              : status === 'exceeded'
              ? 'bg-[#FEF3F2] text-[#991B1B]'
              : 'bg-[#FFF7ED] text-[#9A3412]'
          }`}
        >
          {status === 'compliant'
            ? 'Wajar'
            : status === 'exceeded'
            ? 'Lebih Batas'
            : 'Belum Diatur'}
        </span>
      );
    }
    if (item.type === 'conduct_check') {
      const total = typeof item.verdict?.total_violations === 'number' ? item.verdict.total_violations : 0;
      return (
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
            total > 0 ? 'bg-[#FEF3F2] text-[#991B1B]' : 'bg-[#E8EDEA] text-[#4A5D4E]'
          }`}
        >
          {total > 0 ? `${total} Isu` : 'Aman'}
        </span>
      );
    }
    return null;
  };

  return (
    <div id="case-history-section" className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-widest flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-[#6B7280]" />
          <span>{t.recent_cases_title}</span>
        </h3>
        <span className="text-[10px] text-[#4A5D4E] font-semibold">
          {cases.length} {lang === 'id' ? 'tersimpan' : 'saved'}
        </span>
      </div>

      <div className="space-y-1.5">
        {cases.slice(0, 5).map((c) => {
          const dateStr = new Date(c.createdAt).toLocaleDateString(
            lang === 'id' ? 'id-ID' : 'en-US',
            { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
          );

          return (
            <div
              key={c.id || c.createdAt}
              onClick={() => onSelectCase && onSelectCase(c)}
              className="p-3 bg-white hover:bg-[#F0F4F1] border border-[#E5E2D9] hover:border-[#4A5D4E] rounded-xl text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors shadow-2xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-[#FAF9F6] border border-[#E5E2D9] shrink-0">
                  {getIcon(c.type)}
                </div>
                <div className="truncate">
                  <span className="font-semibold text-[#2C362F] block truncate">
                    {getTypeLabel(c.type)}
                  </span>
                  <span className="text-[10px] text-[#6B7280] block">{dateStr}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {getVerdictBadge(c)}
                <ChevronRight className="w-3.5 h-3.5 text-[#6B7280]" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
