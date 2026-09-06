'use client';

import React from 'react';
import { Shield, LogOut, Globe, AlertTriangle } from 'lucide-react';
import { i18n } from '@/lib/i18n';
import { Language } from '@/lib/types';

interface HeaderProps {
  lang: Language;
  onToggleLang: () => void;
  isAuthenticated: boolean;
  userEmail?: string | null;
  onSignOut: () => void;
  onGoHome: () => void;
}

export function Header({
  lang,
  onToggleLang,
  isAuthenticated,
  userEmail,
  onSignOut,
  onGoHome,
}: HeaderProps) {
  const t = i18n[lang].app;

  const handlePanicExit = () => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
        localStorage.removeItem('perisai_demo_token');
        localStorage.removeItem('perisai_demo_user');
        window.location.replace('https://www.kompas.com');
      }
    } catch {
      window.location.href = 'https://www.kompas.com';
    }
  };

  return (
    <header id="perisai-main-header" className="w-full px-5 lg:px-10 pt-6 pb-4 border-b border-[#E5E2D9] bg-[#FAF9F6] sm:rounded-t-2xl lg:rounded-none">
      <div className="flex items-center justify-between gap-2">
        <button
          id="perisai-brand-home-btn"
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-2.5 text-left group focus:outline-hidden cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-[#4A5D4E] text-white flex items-center justify-center font-bold shadow-xs transition-transform group-hover:scale-105">
            <Shield className="w-4 h-4 text-[#F0F4F1]" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-[#2C362F] block leading-tight">
              {t.name.toUpperCase()}
            </span>
            <span className="text-[10px] text-[#6B7280] block leading-tight font-semibold tracking-wider uppercase">
              {lang === 'id' ? 'Kepatuhan & Etika' : 'Compliance & Ethics'}
            </span>
          </div>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            id="panic-exit-btn"
            type="button"
            onClick={handlePanicExit}
            title={t.panic_desc}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FEF3F2] hover:bg-[#FEE2E2] text-[#991B1B] text-xs font-semibold border border-[#FEE2E2] transition-colors cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-[#991B1B]" />
            <span className="text-[11px]">{t.panic_button}</span>
          </button>

          <div className="flex items-center rounded-lg border border-[#4A5D4E] overflow-hidden p-0.5 bg-white">
            <button
              id="lang-id-btn"
              type="button"
              onClick={() => { if (lang !== 'id') onToggleLang(); }}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-sm transition-colors cursor-pointer ${
                lang === 'id'
                  ? 'bg-[#4A5D4E] text-white'
                  : 'text-[#4A5D4E] hover:bg-[#F0F4F1]'
              }`}
            >
              ID
            </button>
            <button
              id="lang-en-btn"
              type="button"
              onClick={() => { if (lang !== 'en') onToggleLang(); }}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-sm transition-colors cursor-pointer ${
                lang === 'en'
                  ? 'bg-[#4A5D4E] text-white'
                  : 'text-[#4A5D4E] hover:bg-[#F0F4F1]'
              }`}
            >
              EN
            </button>
          </div>

          {isAuthenticated && (
            <button
              id="user-signout-btn"
              type="button"
              onClick={onSignOut}
              title={lang === 'id' ? 'Keluar akun' : 'Sign out'}
              className="p-1.5 rounded-lg bg-white hover:bg-[#F0F4F1] text-[#6B7280] hover:text-[#2C362F] border border-[#E5E2D9] transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {isAuthenticated && userEmail && (
        <div id="user-email-badge" className="mt-3 pt-2 border-t border-[#E5E2D9]/70 text-[11px] text-[#6B7280] truncate flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#D1D5DB] border border-white shadow-2xs flex items-center justify-center font-bold text-[10px] text-[#2C362F] shrink-0">
            {userEmail.charAt(0).toUpperCase()}
          </div>
          <div className="truncate flex-1">
            <span className="text-[9px] uppercase tracking-widest text-[#6B7280] font-bold block leading-none">
              {lang === 'id' ? 'Akun Terverifikasi' : 'Active Account'}
            </span>
            <span className="text-xs font-medium text-[#2C362F] truncate block">{userEmail}</span>
          </div>
        </div>
      )}
    </header>
  );
}
