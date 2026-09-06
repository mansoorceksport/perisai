'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Calculator, MessageSquareText, ShieldAlert, ArrowRight, CheckCircle2, Lock, Sparkles, AlertTriangle } from 'lucide-react';
import { Header } from '@/components/Header';
import { EmergencyBar } from '@/components/EmergencyBar';
import { LicenceCheck } from '@/components/LicenceCheck';
import { RateCalculator } from '@/components/RateCalculator';
import { ConductAnalyzer } from '@/components/ConductAnalyzer';
import { ComplaintView } from '@/components/ComplaintView';
import { CaseHistory } from '@/components/CaseHistory';
import { signInWithGoogle, signOutUser, subscribeToSession } from '@/lib/firebase-client';
import { Language, CaseRecord, ConductViolation } from '@/lib/types';
import { i18n } from '@/lib/i18n';
import { stripUndefined } from '@/lib/utils';

type ActiveView = 'picker' | 'licence' | 'calculator' | 'conduct' | 'complaint';

interface ComplaintPrefill {
  lenderName: string;
  status: string;
  violations?: ConductViolation[];
  evidenceText?: string;
}

export default function Home() {
  const [lang, setLang] = useState<Language>('id');
  const [user, setUser] = useState<{ uid: string; email: string | null; displayName: string | null } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<ActiveView>('picker');
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [persistenceError, setPersistenceError] = useState<{ message: string; retryFn: () => void } | null>(null);
  const [complaintPrefill, setComplaintPrefill] = useState<ComplaintPrefill>({
    lenderName: '',
    status: '',
    violations: [],
    evidenceText: '',
  });

  const t = i18n[lang];

  // Restore and track the session. Firebase recovers a real Google sign-in
  // asynchronously from IndexedDB, so this must subscribe rather than read
  // storage once — otherwise a refresh lands the user back on the sign-in screen.
  useEffect(() => {
    const unsubscribe = subscribeToSession((sessionUser, sessionToken) => {
      setUser(sessionUser);
      setToken(sessionToken);
      setLoadingAuth(false);
    });
    return unsubscribe;
  }, []);

  // Fetch recent cases once user & token exist
  useEffect(() => {
    if (!user || !user.uid) return;

    const loadCases = async () => {
      try {
        if (token) {
          const res = await fetch('/api/cases', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.cases)) {
              setCases(data.cases);
              return;
            }
          }
        }

        const { db } = await import('@/lib/firebase-client');
        const { collection, getDocs, query, orderBy, limit } = await import('firebase/firestore');
        if (!db) return;
        const q = query(
          collection(db, 'users', user.uid, 'cases'),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        const snapshot = await getDocs(q);
        const fetchedCases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as CaseRecord[];
        setCases(fetchedCases);
      } catch (err) {
        console.warn('Case history fetch note:', err);
      }
    };

    loadCases();
  }, [user, token]);

  const handleSignIn = async () => {
    setLoadingAuth(true);
    try {
      const res = await signInWithGoogle();
      setUser(res.user);
      setToken(res.token);
    } catch (err) {
      console.error('Sign in error:', err);
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setUser(null);
    setToken(null);
    setActiveView('picker');
  };

  const handleToggleLang = () => {
    setLang((prev) => (prev === 'id' ? 'en' : 'id'));
  };

  const handleSaveCase = async (
    type: 'lender_check' | 'rate_check' | 'conduct_check',
    input: any,
    verdict: any
  ) => {
    if (!user || !user.uid) return;
    setPersistenceError(null);

    // Every write goes through /api/cases, which verifies the ID token with the
    // Admin SDK before touching Firestore. There is deliberately NO client-side
    // Firestore fallback here: a fallback fires exactly when the server path
    // fails — including on a 401 — so a write the server refused for bad auth
    // would silently succeed from the client instead. A failed write must
    // surface as an error with a Retry, never quietly route around the check.
    const performSave = async () => {
      if (!token) {
        throw new Error('No session token available; refusing to write.');
      }

      const cleanedCase = stripUndefined({ input, verdict });

      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type,
          input: cleanedCase.input,
          verdict: cleanedCase.verdict,
          lang,
        }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error || `Case write rejected (HTTP ${res.status}).`);
      }

      const data = await res.json();
      if (!data?.case) {
        throw new Error('Case write succeeded but returned no record.');
      }

      setCases((prev) => [data.case, ...prev]);
      setPersistenceError(null);
    };

    try {
      await performSave();
    } catch (err) {
      console.error('Save case error:', err);
      // Directive 8: Catch write rejections and surface a visible error with a Retry action.
      setPersistenceError({
        message: t.errors.save_failed,
        retryFn: () => handleSaveCase(type, input, verdict),
      });
    }
  };

  const handleOpenComplaint = (
    lenderName: string,
    status: string,
    violations: ConductViolation[] = [],
    evidenceText: string = ''
  ) => {
    setComplaintPrefill({
      lenderName,
      status,
      violations,
      evidenceText,
    });
    setActiveView('complaint');
  };

  return (
    <main className="min-h-screen bg-[#E5E7EB] text-[#2C362F] sm:py-6 lg:py-0 flex items-center justify-center font-sans">
      {/* Phone frame below md; full-bleed application surface at lg+ — the card
          framing (rounding, border, shadow, grey gutter) is dropped so the app
          fills the window on desktop.
          No overflow-hidden: it establishes a scrollport and would silently
          break position:sticky in the calculator's results column. The header
          and footer round their own outer corners below lg instead. */}
      <div className="w-full max-w-[460px] md:max-w-[768px] lg:max-w-none min-h-screen sm:min-h-[768px] lg:min-h-screen sm:rounded-2xl lg:rounded-none bg-[#FAF9F6] shadow-xl lg:shadow-none sm:border lg:border-0 border-[#E5E2D9] flex flex-col justify-between relative">
        <div>
          <Header
            lang={lang}
            onToggleLang={handleToggleLang}
            isAuthenticated={Boolean(user)}
            userEmail={user?.email}
            onSignOut={handleSignOut}
            onGoHome={() => setActiveView('picker')}
          />

          {/* Full-bleed at lg, but held to a sane measure on ultrawide displays
              so the calculator's results column cannot stretch indefinitely. */}
          <div className="w-full px-6 lg:px-10 2xl:max-w-[1600px] 2xl:mx-auto pt-2 pb-4">
            {/* Persistence Write Rejection Alert (Directive 8) */}
            {persistenceError && (
              <div
                id="persistence-error-banner"
                className="mb-3 p-3 bg-[#FEF3F2] border border-[#FEE2E2] rounded-xl text-xs flex items-center justify-between gap-2 text-[#991B1B]"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#991B1B] shrink-0" />
                  <span>{persistenceError.message}</span>
                </div>
                <button
                  id="retry-save-btn"
                  type="button"
                  onClick={() => {
                    const fn = persistenceError.retryFn;
                    setPersistenceError(null);
                    fn();
                  }}
                  className="px-2.5 py-1 bg-[#991B1B] text-white rounded-lg font-bold text-[11px] hover:bg-[#7F1D1D] transition-colors shrink-0 cursor-pointer"
                >
                  {t.errors.retry}
                </button>
              </div>
            )}

            {/* Session restore is async. Without this gate the landing screen
                paints for a frame on every refresh before Firebase reports the
                recovered user, which reads as being signed out. */}
            {loadingAuth ? (
              <div id="auth-restoring-screen" className="py-20 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-[#E5E2D9] border-t-[#4A5D4E] animate-spin" />
                <p className="text-xs text-[#6B7280]">{t.auth.authenticating}</p>
              </div>
            ) : /* SCREEN 0: LANDING & GOOGLE SIGN-IN */
            !user ? (
              <div id="landing-screen" className="space-y-5 pt-2 lg:max-w-[520px] lg:mx-auto">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-xl bg-[#4A5D4E] text-white mx-auto flex items-center justify-center shadow-xs">
                    <Shield className="w-6 h-6 text-[#F0F4F1]" />
                  </div>
                  <h1 className="text-xl font-bold text-[#2C362F] tracking-tight">
                    {t.auth.welcome_title}
                  </h1>
                  <p className="text-xs text-[#6B7280] max-w-xs mx-auto leading-relaxed">
                    {t.auth.welcome_subtitle}
                  </p>
                </div>

                {/* Security & Reassurance Guarantee */}
                <div className="p-4 bg-white rounded-2xl border border-[#E5E2D9] shadow-xs space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 font-bold text-[#2C362F]">
                    <Lock className="w-4 h-4 text-[#4A5D4E] shrink-0" />
                    <span>{lang === 'id' ? 'Kerahasiaan & Keamanan Data' : 'Privacy & Security Guarantee'}</span>
                  </div>
                  <p className="text-[#6B7280] leading-relaxed text-[11px]">
                    {t.auth.sign_in_note}
                  </p>
                </div>

                {/* Single Sign-In Action (Section A1 Mandate) */}
                <div className="space-y-3">
                  <button
                    id="google-signin-btn"
                    type="button"
                    onClick={handleSignIn}
                    disabled={loadingAuth}
                    className="w-full py-3 px-4 bg-[#4A5D4E] hover:bg-[#3D4D40] active:scale-[0.99] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#EA4335"
                        d="M12 5c1.56 0 2.96.54 4.07 1.43l3.05-3.05C17.26 1.7 14.81 1 12 1 7.37 1 3.48 3.65 1.63 7.5l3.66 2.84C6.17 7.42 8.86 5 12 5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M23.5 12.27c0-.85-.07-1.48-.22-2.27H12v4.51h6.6c-.29 1.5-1.14 2.76-2.42 3.61l3.73 2.89c2.19-2.02 3.59-4.99 3.59-8.74z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.29 14.66c-.23-.68-.36-1.41-.36-2.16s.13-1.48.36-2.16L1.63 7.5C.59 9.56 0 11.87 0 14.32s.59 4.76 1.63 6.82l3.66-2.84c-.01-.01 0 0 0 0z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23.5c3.24 0 5.95-1.07 7.93-2.91l-3.73-2.89c-1.07.72-2.45 1.16-4.2 1.16-3.14 0-5.83-2.42-6.71-5.34L1.63 16.36C3.48 20.21 7.37 23.5 12 23.5z"
                      />
                    </svg>
                    <span>{t.auth.sign_in_google}</span>
                  </button>
                </div>

                {/* 3 Core Tools Preview */}
                <div className="space-y-2.5 pt-2">
                  <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest block">
                    {lang === 'id' ? 'Tiga Alat Kepatuhan Utama:' : 'Three Core Compliance Tools:'}
                  </span>

                  <div className="p-3.5 bg-white rounded-2xl border border-[#E5E2D9] shadow-xs text-xs flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#F0F4F1] text-[#4A5D4E] shrink-0">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-[#2C362F] block">{t.tasks.task1_title}</span>
                      <span className="text-[#6B7280] text-[11px]">{t.tasks.task1_desc}</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-white rounded-2xl border border-[#E5E2D9] shadow-xs text-xs flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#FEF3F2] text-[#991B1B] shrink-0">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-[#2C362F] block">{t.tasks.task2_title}</span>
                      <span className="text-[#6B7280] text-[11px]">{t.tasks.task2_desc}</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-white rounded-2xl border border-[#E5E2D9] shadow-xs text-xs flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#FFF7ED] text-[#9A3412] shrink-0">
                      <MessageSquareText className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-[#2C362F] block">{t.tasks.task3_title}</span>
                      <span className="text-[#6B7280] text-[11px]">{t.tasks.task3_desc}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* AUTHENTICATED APPLICATION VIEWS */
              <div className="space-y-4">
                {/* VIEW: TASK PICKER */}
                {activeView === 'picker' && (
                  <div id="task-picker-screen" className="space-y-4">
                    <div>
                      <h1 className="text-base font-bold text-[#2C362F] leading-tight">
                        {t.tasks.picker_title}
                      </h1>
                      <p className="text-xs text-[#6B7280]">{t.tasks.picker_subtitle}</p>
                    </div>

                    {/* Tasks left, case history as a sidebar at lg+. Stacked below. */}
                    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:items-start">
                    {/* 3 Main Action Task Cards — side by side from md up,
                        each card turning into a vertical stack so the title and
                        description are not squeezed into a third of the row. */}
                    <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-3 md:gap-3 md:items-stretch">
                      {/* Task 1: Licence Check */}
                      <div
                        id="task-open-licence-btn"
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveView('licence')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveView('licence'); }}
                        className="w-full h-full text-left p-4 bg-white hover:border-[#4A5D4E] border border-[#E5E2D9] rounded-2xl transition-all shadow-xs group flex items-center justify-between gap-3 md:flex-col md:items-stretch md:justify-start md:gap-4 cursor-pointer"
                      >
                        <div className="flex items-start gap-3.5 md:flex-col md:gap-3">
                          <div className="p-2.5 rounded-lg bg-[#F0F4F1] text-[#4A5D4E] group-hover:scale-105 transition-transform shrink-0">
                            <Shield className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-bold text-[#2C362F] block">
                                {t.tasks.task1_title}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E8EDEA] text-[#4A5D4E] font-bold uppercase">
                                CEK IZIN
                              </span>
                            </div>
                            <span className="text-xs text-[#6B7280] leading-relaxed block">
                              {t.tasks.task1_desc}
                            </span>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#6B7280] group-hover:text-[#4A5D4E] transition-colors shrink-0 md:self-end md:mt-auto" />
                      </div>

                      {/* Task 2: Rate Calculator */}
                      <div
                        id="task-open-calculator-btn"
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveView('calculator')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveView('calculator'); }}
                        className="w-full h-full text-left p-4 bg-white hover:border-[#4A5D4E] border border-[#E5E2D9] rounded-2xl transition-all shadow-xs group flex items-center justify-between gap-3 md:flex-col md:items-stretch md:justify-start md:gap-4 cursor-pointer"
                      >
                        <div className="flex items-start gap-3.5 md:flex-col md:gap-3">
                          <div className="p-2.5 rounded-lg bg-[#FEF3F2] text-[#991B1B] group-hover:scale-105 transition-transform shrink-0">
                            <Calculator className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-bold text-[#2C362F] block">
                                {t.tasks.task2_title}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#991B1B] font-bold uppercase">
                                KALKULATOR
                              </span>
                            </div>
                            <span className="text-xs text-[#6B7280] leading-relaxed block">
                              {t.tasks.task2_desc}
                            </span>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#6B7280] group-hover:text-[#4A5D4E] transition-colors shrink-0 md:self-end md:mt-auto" />
                      </div>

                      {/* Task 3: Collection Conduct Analyzer */}
                      <div
                        id="task-open-conduct-btn"
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveView('conduct')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveView('conduct'); }}
                        className="w-full h-full text-left p-4 bg-white hover:border-[#4A5D4E] border border-[#E5E2D9] rounded-2xl transition-all shadow-xs group flex items-center justify-between gap-3 md:flex-col md:items-stretch md:justify-start md:gap-4 cursor-pointer"
                      >
                        <div className="flex items-start gap-3.5 md:flex-col md:gap-3">
                          <div className="p-2.5 rounded-lg bg-[#FFF7ED] text-[#9A3412] group-hover:scale-105 transition-transform shrink-0">
                            <MessageSquareText className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-bold text-[#2C362F] block">
                                {t.tasks.task3_title}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFEDD5] text-[#9A3412] font-bold uppercase">
                                PENAGIHAN
                              </span>
                            </div>
                            <span className="text-xs text-[#6B7280] leading-relaxed block">
                              {t.tasks.task3_desc}
                            </span>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#6B7280] group-hover:text-[#4A5D4E] transition-colors shrink-0 md:self-end md:mt-auto" />
                      </div>
                    </div>

                    {/* Case History — sidebar at lg+, section below on mobile. */}
                    <div className="pt-2 lg:pt-0">
                      <CaseHistory
                        lang={lang}
                        cases={cases}
                        onSelectCase={(c) => {
                          if (c.type === 'lender_check') setActiveView('licence');
                          else if (c.type === 'rate_check') setActiveView('calculator');
                          else if (c.type === 'conduct_check') setActiveView('conduct');
                        }}
                      />
                    </div>
                    </div>
                  </div>
                )}

                {/* VIEW: LICENCE CHECK
                    Held to a reading measure at lg+ until batch B gives it a
                    deliberate desktop layout. */}
                {activeView === 'licence' && (
                  <LicenceCheck
                    lang={lang}
                    onBack={() => setActiveView('picker')}
                    onOpenComplaint={(lenderName, status) =>
                      handleOpenComplaint(lenderName, status)
                    }
                    onSaveCase={handleSaveCase}
                  />
                )}

                {/* VIEW: RATE CALCULATOR */}
                {activeView === 'calculator' && (
                  <RateCalculator
                    lang={lang}
                    onBack={() => setActiveView('picker')}
                    onOpenComplaint={(lenderName, status) =>
                      handleOpenComplaint(lenderName, status)
                    }
                    onSaveCase={handleSaveCase}
                  />
                )}

                {/* VIEW: CONDUCT ANALYZER */}
                {activeView === 'conduct' && (
                  <ConductAnalyzer
                    lang={lang}
                    onBack={() => setActiveView('picker')}
                    onOpenComplaint={(lenderName, status, violations, evidenceText) =>
                      handleOpenComplaint(lenderName, status, violations, evidenceText)
                    }
                    onSaveCase={handleSaveCase}
                  />
                )}

                {/* VIEW: COMPLAINT GENERATOR */}
                {activeView === 'complaint' && (
                  <ComplaintView
                    lang={lang}
                    onBack={() => setActiveView('picker')}
                    initialLenderName={complaintPrefill.lenderName}
                    initialLenderStatus={complaintPrefill.status}
                    initialViolations={complaintPrefill.violations}
                    initialEvidenceText={complaintPrefill.evidenceText}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          {/* ALWAYS VISIBLE EMERGENCY CRISIS BAR */}
          <div className="w-full px-6 lg:px-10 2xl:max-w-[1600px] 2xl:mx-auto">
            <EmergencyBar lang={lang} />
          </div>

          {/* NATURAL TONES DISCLAIMER FOOTER
              Rounds its own bottom corners below lg: the shell no longer clips.
              At lg+ the surface is full-bleed, so the rounding is dropped. */}
          <footer className="px-6 lg:px-10 py-3.5 bg-[#F0F4F1] border-t border-[#E5E2D9] mt-4 sm:rounded-b-2xl lg:rounded-none">
            <p className="text-[10px] text-[#4A5D4E]/80 leading-relaxed italic text-center">
              {lang === 'id'
                ? 'Perisai adalah alat bantu analisis. Keputusan hukum tetap berada pada otoritas berwenang. Segala bentuk pelanggaran harap dilaporkan ke Kontak OJK 157.'
                : 'Perisai is an analysis tool. Legal decisions remain with the relevant authorities. Report all violations to OJK Contact 157.'}
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}
