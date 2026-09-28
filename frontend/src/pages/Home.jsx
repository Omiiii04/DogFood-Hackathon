import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTimer } from '../hooks/useTimer';

export const Home = () => {
  const { user } = useAuth();
  const [deadline] = useState(() => new Date(Date.now() + 24 * 3600 * 1000));
  const timeLeft = useTimer(deadline);

  return (
    <div className="flex flex-col w-full pt-20 max-w-[1280px] mx-auto px-margin-mobile md:px-margin">
      <div className="relative w-full overflow-hidden pb-12 pt-6">
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[980px] h-[480px] bg-gradient-to-b from-primary/10 via-secondary-fixed/30 to-transparent blur-3xl opacity-70 -z-10"></div>
        <div className="pointer-events-none absolute top-40 right-10 w-72 h-72 bg-tertiary-container/10 rounded-full blur-2xl -z-10"></div>
        <div className="pointer-events-none absolute top-20 left-12 w-64 h-64 bg-primary-container/10 rounded-full blur-2xl -z-10"></div>
        
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto px-margin-mobile md:px-0">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-surface-container-low border border-outline-variant/30 shadow-xs mb-6 transition-transform hover:scale-[1.02] cursor-default whitespace-nowrap shrink-0">
            <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse shrink-0"></span>
            <span className="material-symbols-outlined text-[15px] text-primary shrink-0">security</span>
            <span className="font-label-caps text-[11px] text-primary font-bold tracking-wide uppercase whitespace-nowrap">Air-Gapped • Statistical Normalization • Zero Cloud Dependency</span>
          </div>
          
          <h1 className="font-display-hero text-display-hero md:text-[52px] md:leading-[60px] text-on-surface tracking-tight font-extrabold max-w-3xl mb-5">
            Self-Hosted Hackathon Submissions & Fair Scoring.
          </h1>
          
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto mb-8 font-normal leading-relaxed">
            Dogfood 2026 brings enterprise-grade hackathon administration directly into containerized offline infrastructure. Features route-isolated score isolation, automated judge matching, and Empirical Bayesian score stabilization.
          </p>
          
          <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
            <Link to="/gallery" className="inline-flex items-center justify-center gap-2.5 px-7 py-3 h-12 rounded-full bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_8px_20px_rgba(30,96,255,0.28)] hover:bg-primary hover:shadow-[0_12px_24px_rgba(30,96,255,0.36)] active:scale-[0.98] transition-all whitespace-nowrap shrink-0">
              <span className="whitespace-nowrap">Explore Project Gallery</span>
              <span className="material-symbols-outlined text-[20px] transition-transform group-hover:translate-x-1">arrow_forward</span>
            </Link>
            
            {!user ? (
              <Link to="/register" className="inline-flex items-center justify-center gap-2 px-6 py-3 h-12 rounded-full bg-surface-container-lowest text-on-surface border border-outline-variant/60 font-title-md text-title-md font-bold hover:bg-surface-container-low hover:border-outline shadow-sm active:scale-[0.98] transition-all whitespace-nowrap shrink-0 min-w-max">
                <span className="material-symbols-outlined text-[20px] text-primary shrink-0">how_to_reg</span>
                <span className="whitespace-nowrap">Participant Registration</span>
              </Link>
            ) : user.role === 'judge' ? (
              <Link to="/judging" className="inline-flex items-center justify-center gap-2 px-6 py-3 h-12 rounded-full bg-surface-container-lowest text-on-surface border border-outline-variant/60 font-title-md text-title-md font-bold hover:bg-surface-container-low hover:border-outline shadow-sm active:scale-[0.98] transition-all whitespace-nowrap shrink-0 min-w-max">
                <span className="material-symbols-outlined text-[20px] text-primary shrink-0">how_to_reg</span>
                <span className="whitespace-nowrap">Go to Judging Queue</span>
              </Link>
            ) : (
              <Link to="/submit" className="inline-flex items-center justify-center gap-2 px-6 py-3 h-12 rounded-full bg-surface-container-lowest text-on-surface border border-outline-variant/60 font-title-md text-title-md font-bold hover:bg-surface-container-low hover:border-outline shadow-sm active:scale-[0.98] transition-all whitespace-nowrap shrink-0 min-w-max">
                <span className="material-symbols-outlined text-[20px] text-primary shrink-0">how_to_reg</span>
                <span className="whitespace-nowrap">Manage My Project</span>
              </Link>
            )}
          </div>
          
          <div className="w-full bg-surface-container-lowest/90 backdrop-blur-md rounded-2xl border border-surface-container shadow-sm p-6 sm:p-8 mb-8 text-left overflow-hidden">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-surface-container">
              <div className="flex items-center gap-4 shrink-0">
                <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0 shadow-inner">
                  <span className="material-symbols-outlined text-[26px]">timer</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>SUBMISSIONS OPEN
                    </span>
                    <span className="font-label-caps text-label-caps text-on-surface-variant font-semibold whitespace-nowrap">Round 01 Verification</span>
                  </div>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">DOGFOOD 2026 Sprint Deadline</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between lg:justify-end gap-6 w-full lg:w-auto">
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex flex-col items-center justify-center w-16 sm:w-20 h-16 rounded-xl bg-surface-container-low border border-surface-container shadow-xs">
                    <span className="font-label-countdown text-label-countdown text-on-surface tracking-tight font-extrabold leading-none">{String(timeLeft.hours).padStart(2, '0')}</span>
                    <span className="font-label-caps text-[10px] text-on-surface-variant uppercase font-bold tracking-wider mt-1">Hours</span>
                  </div>
                  <span className="font-label-countdown text-on-surface-variant font-bold text-lg -mt-1">:</span>
                  <div className="flex flex-col items-center justify-center w-16 sm:w-20 h-16 rounded-xl bg-surface-container-low border border-surface-container shadow-xs">
                    <span className="font-label-countdown text-label-countdown text-on-surface tracking-tight font-extrabold leading-none">{String(timeLeft.minutes).padStart(2, '0')}</span>
                    <span className="font-label-caps text-[10px] text-on-surface-variant uppercase font-bold tracking-wider mt-1">Minutes</span>
                  </div>
                  <span className="font-label-countdown text-on-surface-variant font-bold text-lg -mt-1">:</span>
                  <div className="flex flex-col items-center justify-center w-16 sm:w-20 h-16 rounded-xl bg-surface-container-low border border-surface-container shadow-xs">
                    <span className="font-label-countdown text-label-countdown text-primary-container tracking-tight font-extrabold leading-none">{String(timeLeft.seconds).padStart(2, '0')}</span>
                    <span className="font-label-caps text-[10px] text-on-surface-variant uppercase font-bold tracking-wider mt-1">Seconds</span>
                  </div>
                </div>
                <div className="hidden xl:flex flex-col items-end border-l border-surface-container pl-6 shrink-0">
                  <span className="font-label-caps text-label-caps text-outline uppercase font-semibold whitespace-nowrap">Organized By</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="material-symbols-outlined text-[16px] text-secondary">terminal</span>
                    <span className="font-title-md text-title-md font-bold text-on-surface whitespace-nowrap">Hackathon Raptors</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 pt-5">
              <span className="font-label-caps text-label-caps text-outline uppercase font-bold mr-1.5 whitespace-nowrap">System State:</span>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low border border-outline-variant/30 text-on-surface text-xs font-semibold whitespace-nowrap"><span className="material-symbols-outlined text-[15px] text-primary">wifi_off</span><span>Offline Safe</span></div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low border border-outline-variant/30 text-on-surface text-xs font-semibold whitespace-nowrap"><span className="material-symbols-outlined text-[15px] text-tertiary">hub</span><span>Judge Matching Active</span></div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low border border-outline-variant/30 text-on-surface text-xs font-semibold whitespace-nowrap"><span className="material-symbols-outlined text-[15px] text-emerald-600">tune</span><span>Fair Scoring Enabled</span></div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low border border-outline-variant/30 text-on-surface text-xs font-semibold ml-auto hidden sm:inline-flex whitespace-nowrap"><span className="material-symbols-outlined text-[15px] text-secondary">memory</span><span>Zero Remote Telemetry</span></div>
            </div>
          </div>
        </div>
      </div>

      <section className="w-full py-8">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-primary font-label-caps text-label-caps font-bold uppercase tracking-wider mb-2">
            <span className="material-symbols-outlined text-[15px]">grid_view</span>
            <span>Core Architecture</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface font-extrabold tracking-tight">
            Engineered for Impartiality & Offline Reliability
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-xl mt-1">
            High-integrity competition orchestration designed specifically for collegiate engineering hackathons operating in offline campus clusters.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="group relative flex flex-col justify-between bg-surface-container-lowest rounded-2xl p-6 sm:p-7 border border-surface-container shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200">
            <div>
              <div className="w-12 h-12 rounded-xl bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed mb-5 group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[24px]">memory</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight mb-2">
                Containerized Air-Gap Architecture
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-6">
                Zero external dependencies, self-contained local network deployment ensuring zero latency and air-tight data security. Built for strict offline collegiate competition environments.
              </p>
            </div>
            <div className="pt-4 border-t border-surface-container flex items-center justify-between text-xs text-on-surface-variant font-semibold">
              <span className="inline-flex items-center gap-1 text-tertiary">
                <span className="material-symbols-outlined text-[14px]">lock</span>
                Air-Gap Enforced
              </span>
              <span className="font-label-numeric font-bold text-outline">v2.6 Local Node</span>
            </div>
          </div>
          
          <div className="group relative flex flex-col justify-between bg-surface-container-lowest rounded-2xl p-6 sm:p-7 border border-surface-container shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200">
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800 mb-5 group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[24px]">verified_user</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight mb-2">
                Route-Isolated Score Isolation
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-6">
                Tamper-proof judging partitions where evaluation metrics stay encrypted until peer review cycles close. Eliminates early-leak bias and maintains jury independence.
              </p>
            </div>
            <div className="pt-4 border-t border-surface-container flex items-center justify-between text-xs text-on-surface-variant font-semibold">
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <span className="material-symbols-outlined text-[14px]">encrypted</span>
                Zero-Knowledge Keying
              </span>
              <span className="font-label-numeric font-bold text-outline">SHA-256 Partition</span>
            </div>
          </div>
          
          <div className="group relative flex flex-col justify-between bg-surface-container-lowest rounded-2xl p-6 sm:p-7 border border-surface-container shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200">
            <div>
              <div className="w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center text-on-primary-fixed mb-5 group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[24px]">equalizer</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight mb-2">
                Empirical Bayesian Normalization
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-6">
                Automated statistical balancing eliminating harsh/lenient judge bias to yield genuinely fair leaderboards. Calibrated continuous distributions prevent outlier distortion.
              </p>
            </div>
            <div className="pt-4 border-t border-surface-container flex items-center justify-between text-xs text-on-surface-variant font-semibold">
              <span className="inline-flex items-center gap-1 text-primary">
                <span className="material-symbols-outlined text-[14px]">auto_graph</span>
                Dynamic Calibration
              </span>
              <span className="font-label-numeric font-bold text-outline">P &lt; 0.001 Sig</span>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full py-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-5 rounded-2xl bg-surface-container-low border border-surface-container">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-lowest flex items-center justify-center text-primary shadow-xs shrink-0">
              <span className="material-symbols-outlined text-[20px]">groups</span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-countdown text-on-surface font-extrabold tracking-tight">1,420+</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Active Hackers</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-lowest flex items-center justify-center text-secondary shadow-xs shrink-0">
              <span className="material-symbols-outlined text-[20px]">folder_special</span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-countdown text-on-surface font-extrabold tracking-tight">386</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Air-Gap Submissions</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-lowest flex items-center justify-center text-tertiary shadow-xs shrink-0">
              <span className="material-symbols-outlined text-[20px]">gavel</span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-countdown text-on-surface font-extrabold tracking-tight">48</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Calibrated Evaluators</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-lowest flex items-center justify-center text-emerald-600 shadow-xs shrink-0">
              <span className="material-symbols-outlined text-[20px]">speed</span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-countdown text-on-surface font-extrabold tracking-tight">0.0 ms</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">External Cloud Lag</span>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full py-6 mb-4">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-primary-container to-secondary p-8 sm:p-10 text-on-primary shadow-lg">
          <div className="absolute -right-8 -bottom-10 opacity-10 pointer-events-none">
            <span className="material-symbols-outlined text-[240px]">rocket_launch</span>
          </div>
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 max-w-5xl">
            <div className="flex flex-col max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-on-primary/15 text-on-primary font-label-caps text-label-caps uppercase tracking-wider mb-2 self-start backdrop-blur-sm">
                <span>Student Sprint 2026</span>
              </div>
              <h2 className="font-headline-lg text-headline-lg font-extrabold tracking-tight text-on-primary mb-2">
                Ready to showcase your project?
              </h2>
              <p className="font-body-md text-body-md text-on-primary/90 leading-relaxed">
                Ensure your container package meets the air-gap specifications prior to the deadline cutoff. Submissions undergo automated statistical evaluation immediately.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0 w-full sm:w-auto mt-2 md:mt-0">
              <Link to="/submit" className="inline-flex items-center justify-center gap-2 px-6 h-11 rounded-full bg-surface-container-lowest text-primary font-title-md text-title-md font-bold hover:bg-surface-container-low shadow-sm active:scale-[0.98] transition-all whitespace-nowrap">
                <span className="material-symbols-outlined text-[18px]">publish</span>
                <span className="whitespace-nowrap">Submission Portal</span>
              </Link>
              <Link to="/" className="inline-flex items-center justify-center gap-2 px-6 h-11 rounded-full bg-on-primary/10 border border-on-primary/20 text-on-primary font-title-md text-title-md font-semibold hover:bg-on-primary/20 backdrop-blur-sm active:scale-[0.98] transition-all whitespace-nowrap shrink-0">
                <span className="whitespace-nowrap">Review Rules</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
