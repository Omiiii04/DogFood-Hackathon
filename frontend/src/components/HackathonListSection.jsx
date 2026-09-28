import React, { useState, useEffect } from 'react';
import { Share2, Heart, X, Calendar, Users, Globe, Clock, Tag } from 'lucide-react';
import api from '../services/api';

/* ─── Static fallback data (shown when backend returns nothing) ─────────── */
const STATIC_HACKATHONS = [
  {
    id: 'h1',
    title: 'Armageddon: Strategy Case Competition',
    organizer: 'Indian Institute of Management (IIM), Ahmedabad',
    logoFallback: 'IIM',
    logoColor: '#c0392b',
    members: '3 Members',
    mode: 'Online',
    tags: ['Management Consulting', 'Strategy & Planning', 'Engineering Students', 'Postgraduate'],
    extraTags: 3,
    postedDate: 'Sep 21, 2026',
    deadline: '5 days left',
    urgent: false,
    description: 'A prestigious strategy case competition hosted by IIM Ahmedabad, challenging participants to solve real-world business problems under time pressure.',
    prize: '₹1,00,000',
    website: null,
  },
  {
    id: 'h2',
    title: 'Commercio Artikel – Article Writing Competition',
    organizer: 'Indian Institute of Foreign Trade (IIFT), New Delhi',
    logoFallback: 'IIFT',
    logoColor: '#1a5276',
    members: '1 – 2 Members',
    mode: 'Online',
    tags: ['Content Writing', 'Everyone can apply'],
    extraTags: 0,
    postedDate: 'Sep 12, 2026',
    deadline: '2 days left',
    urgent: true,
    description: 'Write a compelling article on foreign trade dynamics and international commerce policies. Open to all students across disciplines.',
    prize: '₹25,000',
    website: null,
  },
  {
    id: 'h3',
    title: 'Strategos 2026: Article Writing Competition',
    organizer: 'Indian Institute of Foreign Trade (IIFT), New Delhi',
    logoFallback: 'SG',
    logoColor: '#148f77',
    members: 'Individual Participation',
    mode: 'Online',
    tags: ['Strategy & Planning', 'Content Writing', 'Engineering Students', 'Postgraduate'],
    extraTags: 5,
    postedDate: 'Sep 11, 2026',
    deadline: '8 hours left',
    urgent: true,
    description: 'Strategos 2026 invites students to submit strategy and planning articles covering global market disruption, geopolitics, and business innovation.',
    prize: '₹50,000',
    website: null,
  },
  {
    id: 'h4',
    title: 'DOGFOOD 2026: Engineering Sprint',
    organizer: 'Hackathon Raptors Platform',
    logoFallback: 'DF',
    logoColor: '#6c3483',
    members: '2 – 4 Members',
    mode: 'Offline / Air-Gapped',
    tags: ['AI/ML', 'Web3 & Blockchain', 'FinTech', 'HealthTech'],
    extraTags: 2,
    postedDate: 'Sep 1, 2026',
    deadline: '1 day left',
    urgent: false,
    description: 'The premier air-gapped collegiate engineering sprint hosted by Hackathon Raptors. Build real-world products in 48 hours with fair, automated scoring. No internet — just raw engineering skills.',
    prize: '₹2,00,000',
    website: null,
  },
];

/* ─── Map a backend Event doc to the card shape ──────────────────────────── */
const mapEventToCard = (ev) => {
  const deadline = ev.submissionDeadline ? new Date(ev.submissionDeadline) : null;
  const now = new Date();
  let deadlineLabel = 'Ongoing';
  let urgent = false;
  if (deadline) {
    const diffMs = deadline - now;
    if (diffMs <= 0) {
      deadlineLabel = 'Closed';
    } else {
      const diffHours = Math.floor(diffMs / 3_600_000);
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 0) {
        deadlineLabel = `${diffHours}h left`;
        urgent = diffHours <= 24;
      } else {
        deadlineLabel = `${diffDays} day${diffDays > 1 ? 's' : ''} left`;
        urgent = diffDays <= 2;
      }
    }
  }

  const tracks = Array.isArray(ev.tracks) ? ev.tracks : [];
  return {
    id: ev._id || ev.id,
    title: ev.title || ev.name || 'Unnamed Hackathon',
    organizer: ev.organizer || 'Hackathon Raptors Platform',
    logoFallback: (ev.title || ev.name || 'HK').slice(0, 2).toUpperCase(),
    logoColor: '#6c3483',
    members: ev.teamSize || '2 – 4 Members',
    mode: ev.mode || 'Offline / Air-Gapped',
    tags: tracks.slice(0, 4),
    extraTags: Math.max(0, tracks.length - 4),
    postedDate: ev.createdAt ? new Date(ev.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
    deadline: deadlineLabel,
    urgent,
    description: ev.description || 'No description provided.',
    prize: ev.prize || null,
    website: ev.website || null,
    status: ev.status || 'active',
  };
};

/* ─── Hackathon Detail Overlay ───────────────────────────────────────────── */
const HackathonDetailOverlay = ({ hackathon, onClose }) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handler);
    };
  }, [onClose]);

  const statusColors = {
    active:   'bg-emerald-100 text-emerald-700 border-emerald-300',
    upcoming: 'bg-blue-100 text-blue-700 border-blue-300',
    judging:  'bg-amber-100 text-amber-700 border-amber-300',
    closed:   'bg-slate-100 text-slate-500 border-slate-300',
  };

  const statusLabel = hackathon.status
    ? hackathon.status.charAt(0).toUpperCase() + hackathon.status.slice(1)
    : 'Active';
  const statusClass = statusColors[hackathon.status] || statusColors.active;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 sm:pt-16 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel — explicit white background */}
      <div className="relative w-full max-w-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.35)] flex flex-col overflow-hidden z-10 mb-8"
           style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>

        {/* Header */}
        <div className="flex items-start gap-4 p-6 border-b border-slate-200"
             style={{ background: '#f8fafc' }}>
          <div
            className="shrink-0 w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow select-none"
            style={{ backgroundColor: hackathon.logoColor }}
          >
            {hackathon.logoFallback}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusClass}`}>
                {statusLabel}
              </span>
              {hackathon.urgent && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-300 text-[11px] font-bold">
                  <Clock className="w-3 h-3" /> Urgent
                </span>
              )}
            </div>
            <h2 className="text-[1.15rem] font-extrabold text-slate-900 tracking-tight leading-snug">
              {hackathon.title}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{hackathon.organizer}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5" style={{ background: '#ffffff' }}>
          {/* Meta grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <Users className="w-4 h-4 text-indigo-500 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Team Size</p>
                <p className="text-sm font-semibold text-slate-800">{hackathon.members}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <Globe className="w-4 h-4 text-violet-500 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Format</p>
                <p className="text-sm font-semibold text-slate-800">{hackathon.mode}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <Calendar className="w-4 h-4 text-sky-500 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Deadline</p>
                <p className={`text-sm font-semibold ${hackathon.urgent ? 'text-red-500' : 'text-slate-800'}`}>
                  {hackathon.deadline}
                </p>
              </div>
            </div>
            {hackathon.prize && (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 sm:col-span-1">
                <span className="material-symbols-outlined text-[18px] text-emerald-600 shrink-0">emoji_events</span>
                <div>
                  <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider">Prize Pool</p>
                  <p className="text-sm font-bold text-emerald-800">{hackathon.prize}</p>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <h3 className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-2">About this hackathon</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {hackathon.description}
            </p>
          </div>

          {/* Tracks / Tags */}
          {hackathon.tags.length > 0 && (
            <div>
              <h3 className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-2 flex items-center gap-1.5">
                <Tag className="w-3 h-3" /> Tracks &amp; Categories
              </h3>
              <div className="flex flex-wrap gap-2">
                {hackathon.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
                {hackathon.extraTags > 0 && (
                  <span className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-xs font-bold">
                    +{hackathon.extraTags} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Posted date */}
          <p className="text-xs text-slate-400">Posted {hackathon.postedDate}</p>
        </div>

        {/* Footer CTA */}
        <div className="px-6 pb-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          {hackathon.website ? (
            <a
              href={hackathon.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 h-10 rounded-full bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              Visit Official Page
            </a>
          ) : (
            <a
              href="/submit"
              className="inline-flex items-center gap-2 px-5 h-10 rounded-full bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">publish</span>
              Submit Your Project
            </a>
          )}
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 px-5 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-200 hover:text-slate-800 active:scale-[0.98] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Single card ──────────────────────────────────────────────────────────── */
const HackathonCard = ({ h, onClick }) => {
  const [liked, setLiked] = useState(false);
  const [shared, setShared] = useState(false);

  const handleShare = (e) => {
    e.stopPropagation();
    setShared(true);
    setTimeout(() => setShared(false), 1500);
  };

  const displayedTags = h.tags.slice(0, 4);

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col gap-3 rounded-2xl bg-surface-container-lowest border border-surface-container p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 cursor-pointer transition-all duration-200"
    >
      {/* Top row: title + logo */}
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {h.title}
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 line-clamp-1">
            {h.organizer}
          </p>
        </div>

        {/* Logo bubble */}
        <div
          className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-sm border border-white/20 select-none"
          style={{ backgroundColor: h.logoColor }}
          aria-label={h.logoFallback}
        >
          {h.logoFallback}
        </div>
      </div>

      {/* Meta row: members + mode */}
      <div className="flex items-center gap-4 text-on-surface-variant">
        <span className="flex items-center gap-1.5 font-body-sm text-body-sm">
          <span className="material-symbols-outlined text-[15px]">group</span>
          {h.members}
        </span>
        <span className="flex items-center gap-1.5 font-body-sm text-body-sm">
          <span className="material-symbols-outlined text-[15px]">location_on</span>
          {h.mode}
        </span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {displayedTags.map((tag) => (
          <span
            key={tag}
            className="px-2.5 py-0.5 rounded-full bg-surface-container border border-outline-variant/40 text-on-surface-variant text-xs whitespace-nowrap"
          >
            {tag}
          </span>
        ))}
        {h.extraTags > 0 && (
          <span className="px-2.5 py-0.5 rounded-full bg-surface-container border border-outline-variant/40 text-on-surface-variant text-xs font-bold">
            +{h.extraTags}
          </span>
        )}
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between pt-2 border-t border-surface-container mt-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-outline text-xs">Posted {h.postedDate}</span>
          <span
            className={`flex items-center gap-1 text-xs font-semibold ${
              h.urgent ? 'text-red-500' : 'text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">hourglass_bottom</span>
            {h.deadline}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleShare}
            title="Share"
            className={`p-1.5 rounded-lg transition-all hover:bg-surface-container ${
              shared ? 'text-primary' : 'text-outline hover:text-on-surface'
            }`}
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setLiked((v) => !v); }}
            title="Save"
            className={`p-1.5 rounded-lg transition-all hover:bg-surface-container ${
              liked ? 'text-red-500' : 'text-outline hover:text-on-surface'
            }`}
          >
            <Heart className={`w-4 h-4 ${liked ? 'fill-red-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* "View details" hint on hover */}
      <div className="absolute bottom-3 right-14 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <span className="text-[10px] text-primary font-semibold">View details →</span>
      </div>
    </div>
  );
};

/* ─── Exported section wrapper ─────────────────────────────────────────────── */
export const HackathonListSection = ({
  title = 'Explore Hackathons',
  subtitle = 'Discover active competitions and find your next challenge.',
}) => {
  const [hackathons, setHackathons] = useState(STATIC_HACKATHONS);
  const [selectedHackathon, setSelectedHackathon] = useState(null);
  const [loading, setLoading] = useState(true);

  // Try to fetch real events from the backend; fall back to static data
  useEffect(() => {
    let cancelled = false;
    const fetchEvents = async () => {
      try {
        // The backend's admin stats endpoint or a public events endpoint
        // Try a lightweight health + events fetch via admin stats (auth-gated).
        // We attempt the public submissions gallery to infer active events,
        // but more directly we try /admin/stats which needs auth.
        // Since there's no public events API, we fetch admin stats silently
        // and fall back to static data on any error.
        const res = await api.get('/admin/stats');
        if (!cancelled && res && res.data) {
          const events = res.data.events || res.data.activeEvents || [];
          if (Array.isArray(events) && events.length > 0) {
            setHackathons(events.map(mapEventToCard));
          }
          // else keep static data
        }
      } catch {
        // Not authorized or no events — static data stays
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchEvents();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="w-full py-8">
      {/* Section header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-primary font-label-caps text-label-caps font-bold uppercase tracking-wider mb-2">
            <span className="material-symbols-outlined text-[15px]">emoji_events</span>
            <span>Active Hackathons</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface font-extrabold tracking-tight">
            {title}
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">{subtitle}</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/50 font-label-caps text-label-caps text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px] text-primary">fiber_manual_record</span>
          {hackathons.length} Listed
        </span>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {hackathons.map((h) => (
          <HackathonCard
            key={h.id}
            h={h}
            onClick={() => setSelectedHackathon(h)}
          />
        ))}
      </div>

      {/* Detail overlay */}
      {selectedHackathon && (
        <HackathonDetailOverlay
          hackathon={selectedHackathon}
          onClose={() => setSelectedHackathon(null)}
        />
      )}
    </section>
  );
};
