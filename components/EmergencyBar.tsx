'use client';

import React, { useState } from 'react';
import { Phone, Mail, ShieldAlert, HeartHandshake, ChevronDown, ChevronUp } from 'lucide-react';
import { i18n } from '@/lib/i18n';
import { Language } from '@/lib/types';

interface EmergencyBarProps {
  lang: Language;
}

export function EmergencyBar({ lang }: EmergencyBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = i18n[lang].emergency;

  return (
    <aside
      id="emergency-crisis-bar"
      aria-label={t.title}
      className="mt-6 pt-4 border-t border-[#E5E2D9] text-xs text-[#6B7280]"
    >
      <button
        id="toggle-emergency-contacts-btn"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 rounded-xl bg-[#F0F4F1] border border-[#E5E2D9] text-[#4A5D4E] font-semibold hover:bg-[#E8EDEA] transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#4A5D4E] shrink-0" />
          <span>{t.title}</span>
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div id="emergency-contacts-list" className="mt-2.5 p-4 bg-white rounded-xl border border-[#E5E2D9] space-y-2.5 shadow-2xs">
          <p className="text-[#6B7280] font-normal leading-relaxed">{t.subtitle}</p>
          <div className="grid grid-cols-1 gap-2 pt-1">
            <a
              id="emergency-call-ojk-link"
              href="tel:157"
              className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAF9F6] hover:bg-[#F0F4F1] border border-[#E5E2D9] text-[#2C362F] font-semibold transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#4A5D4E] shrink-0" />
                <span>{t.ojk_call}</span>
              </span>
              <span className="text-[10px] text-[#6B7280]">157</span>
            </a>
            <a
              id="emergency-wa-ojk-link"
              href="https://wa.me/6281157157157"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAF9F6] hover:bg-[#F0F4F1] border border-[#E5E2D9] text-[#2C362F] font-semibold transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#4A5D4E] shrink-0" />
                <span>{t.ojk_wa}</span>
              </span>
              <span className="text-[10px] text-[#4A5D4E] font-medium">WhatsApp</span>
            </a>
            <a
              id="emergency-email-satgas-link"
              href="mailto:satgaspasti@ojk.go.id"
              className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAF9F6] hover:bg-[#F0F4F1] border border-[#E5E2D9] text-[#2C362F] font-medium transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
                <span>{t.satgas_email}</span>
              </span>
              <span className="text-[10px] text-[#6B7280]">Email</span>
            </a>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#FAF9F6] border border-[#E5E2D9] text-[#2C362F]">
              <ShieldAlert className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
              <span>{t.lbh_jakarta}</span>
            </div>
            <a
              id="emergency-sejiwa-link"
              href="tel:119"
              className="flex items-center justify-between p-2.5 rounded-lg bg-[#FEF3F2] hover:bg-[#FEE2E2] border border-[#FEE2E2] text-[#991B1B] font-semibold transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <HeartHandshake className="w-3.5 h-3.5 text-[#991B1B] shrink-0" />
                <span>{t.sejiwa}</span>
              </span>
              <span className="text-[10px] text-[#991B1B]">119 ext 8</span>
            </a>
          </div>
          <p className="text-[11px] text-[#6B7280] italic pt-1">{t.disclaimer}</p>
        </div>
      )}
    </aside>
  );
}
