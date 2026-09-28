import React, { useState } from 'react';
import { useSubmissions } from '../hooks/useSubmissions';
import { ProjectCard } from '../components/ProjectCard';
import { UpvoteWidget } from '../components/UpvoteWidget';
import { renderMarkdownToSafeHTML } from '../utils/markdownSanitizer';
import { Search, Filter, Github, ExternalLink, LayoutGrid, X } from 'lucide-react';
import { getTrackBadgeColor } from '../utils/formatters';

const TRACKS = ['All', 'AI/ML', 'Web3 & Blockchain', 'FinTech', 'HealthTech'];

const TRACK_THUMBNAILS = {
  'AI/ML':             '/thumbnails/thumb_aiml.jpg',
  'Web3 & Blockchain': '/thumbnails/thumb_web3.jpg',
  'FinTech':           '/thumbnails/thumb_fintech.jpg',
  'HealthTech':        '/thumbnails/thumb_healthtech.jpg',
};

const IGNORED_URLS = ['/uploads/default-thumbnail.webp', '', null, undefined];

const getThumbnail = (track, url) => {
  if (url && !IGNORED_URLS.includes(url)) return url;
  return TRACK_THUMBNAILS[track] || '/thumbnails/thumb_default.jpg';
};

/* Shimmer skeleton card */
const SkeletonCard = () => (
  <div className="rounded-2xl overflow-hidden bg-[#0d1424] border border-[#1e2d4a] animate-pulse">
    <div className="h-48 bg-[#111c34]" />
    <div className="p-5 space-y-3">
      <div className="h-4 bg-[#1a2840] rounded-lg w-3/4" />
      <div className="h-3 bg-[#131e30] rounded-lg w-1/3" />
      <div className="h-3 bg-[#131e30] rounded-lg w-full" />
      <div className="h-3 bg-[#131e30] rounded-lg w-5/6" />
    </div>
    <div className="px-5 pb-4 pt-3 border-t border-[#1e2d4a] flex justify-between items-center">
      <div className="h-6 w-16 bg-[#131e30] rounded-lg" />
      <div className="h-6 w-10 bg-[#131e30] rounded-lg" />
    </div>
  </div>
);

export const Gallery = () => {
  const [selectedTrack, setSelectedTrack] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [sortBy, setSortBy] = useState('upvotes');

  const { submissions, loading, error } = useSubmissions(selectedTrack, searchQuery, sortBy);

  return (
    <div className="space-y-0 py-6">

      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#1e2d4a]">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-950/60 border border-blue-800/40 text-blue-400 text-[11px] font-bold uppercase tracking-widest">
              <LayoutGrid className="w-3 h-3" />
              Explore Hackathons
            </span>
          </div>
          <h1 className="text-[1.85rem] font-extrabold text-white tracking-tight leading-tight">
            Project Showcase Gallery
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Browse, explore, and upvote hackathon projects across all competition tracks.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80 shrink-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by title, keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0d1424] border border-[#1e2d4a] text-sm text-white placeholder-slate-600
                       focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10 transition-all"
          />
        </div>
      </div>

      {/* ── Filter + Sort bar ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
        {/* Track filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          {TRACKS.map((track) => (
            <button
              key={track}
              onClick={() => setSelectedTrack(track)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                selectedTrack === track
                  ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.35)]'
                  : 'bg-[#0d1424] border-[#1e2d4a] text-slate-400 hover:text-white hover:border-slate-600'
              }`}
            >
              {track}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Sort:</span>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-xl bg-blue-600 border border-blue-500 text-white text-xs font-bold
                         focus:outline-none focus:ring-2 focus:ring-blue-400/30 cursor-pointer shadow-[0_0_10px_rgba(59,130,246,0.25)]"
            >
              <option value="upvotes">🔥 Community Upvotes</option>
              <option value="newest">✨ Newest First</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/60 text-[10px]">▾</span>
          </div>
        </div>
      </div>

      {/* ── Grid ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
          {[1, 2, 3, 4, 5, 6].map((n) => <SkeletonCard key={n} />)}
        </div>
      ) : error ? (
        <div className="p-10 text-center rounded-2xl bg-rose-950/20 border border-rose-800/40 text-rose-300 text-sm">
          <span className="block text-2xl mb-3">⚠️</span>
          Failed to load gallery: {error}
        </div>
      ) : submissions.length === 0 ? (
        <div className="p-16 text-center rounded-2xl bg-[#0d1424] border border-[#1e2d4a]">
          <span className="material-symbols-outlined text-[48px] text-slate-600 block mb-3">search_off</span>
          <p className="text-slate-500 text-sm">No submissions found matching your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
          {submissions.map((sub) => (
            <ProjectCard
              key={sub._id}
              submission={sub}
              onOpenModal={(project) => setSelectedProject(project)}
            />
          ))}
        </div>
      )}

      {/* ── Detail Overlay (dark-themed) ──────────────────────────────── */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 sm:pt-16 overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setSelectedProject(null)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-3xl bg-[#080f1e] border border-[#1e2d4a] rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden z-10 mb-8">
            {/* Close button */}
            <button
              onClick={() => setSelectedProject(null)}
              className="absolute top-3 right-3 z-20 p-1.5 rounded-lg bg-[#0d1424]/90 border border-[#1e2d4a] text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Hero thumbnail */}
            <div className="relative h-56 w-full bg-[#0a1120] shrink-0 overflow-hidden">
              <img
                src={getThumbnail(selectedProject.track, selectedProject.thumbnailUrl)}
                alt={selectedProject.title}
                className="w-full h-full object-cover opacity-80"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = TRACK_THUMBNAILS[selectedProject.track] || '/thumbnails/thumb_default.jpg';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#080f1e] via-[#080f1e]/20 to-transparent" />
              <div className="absolute bottom-4 left-5">
                <span className={`px-3 py-1 rounded-lg text-xs font-bold border backdrop-blur-md ${getTrackBadgeColor(selectedProject.track)}`}>
                  {selectedProject.track}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Title + team */}
              <div>
                <h2 className="text-xl font-extrabold text-white leading-snug">{selectedProject.title}</h2>
                <p className="text-sm text-slate-300 mt-1 font-medium">{selectedProject.tagline}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Submitted by team{' '}
                  <span className="font-semibold text-slate-300">
                    {selectedProject.teamId?.name || selectedProject.team?.name || '—'}
                  </span>
                </p>
              </div>

              {/* Action links */}
              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[#1e2d4a]">
                {selectedProject.githubUrl && (
                  <a
                    href={selectedProject.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0d1424] border border-[#1e2d4a] hover:border-slate-500 text-sm font-semibold text-white transition-colors"
                  >
                    <Github className="w-4 h-4" />
                    GitHub Repository
                  </a>
                )}
                {selectedProject.demoVideoUrl && (
                  <a
                    href={selectedProject.demoVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-colors shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Live Demo
                  </a>
                )}
                <div className="ml-auto">
                  <UpvoteWidget submission={selectedProject} size="lg" />
                </div>
              </div>

              {/* Description */}
              <div className="border-t border-[#1e2d4a] pt-5">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-3">
                  Project Narrative &amp; Architectural Details
                </h4>
                <div
                  className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed space-y-3"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdownToSafeHTML(selectedProject.description),
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
