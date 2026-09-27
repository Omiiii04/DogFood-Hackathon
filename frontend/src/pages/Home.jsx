import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTimer } from '../hooks/useTimer';
import { ShieldCheck, Cpu, ArrowRight, Zap } from 'lucide-react';

export const Home = () => {
  const { user } = useAuth();
  const [deadline] = useState(() => new Date(Date.now() + 24 * 3600 * 1000));
  const timeLeft = useTimer(deadline);

  return (
    <div className="space-y-16 py-8">
      <section className="relative rounded-3xl bg-gradient-to-b from-surface-raised via-surface to-canvas border border-border-subtle p-8 sm:p-14 overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800 text-blue-300 text-xs font-semibold mb-6">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Air-Gapped • Statistical Normalization • Zero Cloud Dependency</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight mb-6">
            Self-Hosted Hackathon Submissions & Fair Scoring.
          </h1>

          <p className="text-base sm:text-lg text-gray-300 mb-8 leading-relaxed">
            Dogfood 2026 brings enterprise-grade hackathon administration directly into containerized offline infrastructure. Features route-isolated score isolation, automated judge matching, and Empirical Bayesian score stabilization.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/gallery"
              className="px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-glow flex items-center space-x-2 transition-all"
            >
              <span>Explore Project Gallery</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            {!user ? (
              <Link
                to="/register"
                className="px-6 py-3.5 rounded-xl bg-surface-raised hover:bg-surface border border-border-subtle text-gray-200 font-semibold text-sm transition-all"
              >
                Participant Registration
              </Link>
            ) : user.role === 'judge' ? (
              <Link
                to="/judging"
                className="px-6 py-3.5 rounded-xl bg-surface-raised hover:bg-surface border border-border-subtle text-gray-200 font-semibold text-sm transition-all"
              >
                Go to Judging Queue
              </Link>
            ) : (
              <Link
                to="/submit"
                className="px-6 py-3.5 rounded-xl bg-surface-raised hover:bg-surface border border-border-subtle text-gray-200 font-semibold text-sm transition-all"
              >
                Manage My Project
              </Link>
            )}
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border-subtle/60 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-xl">
          <div className="bg-canvas/60 p-4 rounded-xl border border-border-subtle text-center">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-blue-400">
              {String(timeLeft.hours).padStart(2, '0')}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-mono mt-1">Hours</div>
          </div>
          <div className="bg-canvas/60 p-4 rounded-xl border border-border-subtle text-center">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-blue-400">
              {String(timeLeft.minutes).padStart(2, '0')}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-mono mt-1">Minutes</div>
          </div>
          <div className="bg-canvas/60 p-4 rounded-xl border border-border-subtle text-center">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-blue-400">
              {String(timeLeft.seconds).padStart(2, '0')}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-mono mt-1">Seconds</div>
          </div>
          <div className="bg-canvas/60 p-4 rounded-xl border border-border-subtle text-center flex flex-col justify-center">
            <div className="text-xs font-semibold text-emerald-400 flex items-center justify-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>SUBMISSIONS OPEN</span>
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Hackathon Raptors</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-surface border border-border-subtle hover:border-gray-700 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-purple-950/80 border border-purple-800/50 flex items-center justify-center text-purple-400 mb-4">
            <Cpu className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Statistical Normalization</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Eliminates tough-vs-lenient grader discrepancies using Z-score standardization and Empirical Bayesian shrinkage algorithms running on FastAPI.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-surface border border-border-subtle hover:border-gray-700 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-emerald-950/80 border border-emerald-800/50 flex items-center justify-center text-emerald-400 mb-4">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Route-Level Isolation</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Strict Express middleware authorization blocks judges from reading other judges' ballots or evaluating unassigned submissions even on direct API penetration.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-surface border border-border-subtle hover:border-gray-700 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-blue-950/80 border border-blue-800/50 flex items-center justify-center text-blue-400 mb-4">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Zero-Internet Docker Runtime</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Instant multi-container launch via a single <code className="text-xs bg-gray-800 px-1 py-0.5 rounded text-blue-300">docker compose up</code>. No cloud databases, no external font CDNs, no SaaS dependency.
          </p>
        </div>
      </section>
    </div>
  );
};
