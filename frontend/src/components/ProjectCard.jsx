import React from 'react';
import { ExternalLink, Github } from 'lucide-react';
import { getTrackBadgeColor } from '../utils/formatters';
import { UpvoteWidget } from './UpvoteWidget';

/* Track-specific thumbnail fallbacks */
const TRACK_THUMBNAILS = {
  'AI/ML':             '/thumbnails/thumb_aiml.jpg',
  'Web3 & Blockchain': '/thumbnails/thumb_web3.jpg',
  'FinTech':           '/thumbnails/thumb_fintech.jpg',
  'HealthTech':        '/thumbnails/thumb_healthtech.jpg',
};

// Ignore the generic server placeholder; use track-specific images instead
const IGNORED_URLS = ['/uploads/default-thumbnail.webp', '', null, undefined];

const getThumbnail = (track, url) => {
  if (url && !IGNORED_URLS.includes(url)) return url;
  return TRACK_THUMBNAILS[track] || '/thumbnails/thumb_default.jpg';
};

export const ProjectCard = ({ submission, onOpenModal }) => {
  return (
    <div
      onClick={() => onOpenModal && onOpenModal(submission)}
      className="group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer
                 bg-[#0d1424] border border-[#1e2d4a]
                 hover:border-blue-500/60 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_8px_32px_rgba(0,0,0,0.5)]
                 transition-all duration-300"
    >
      {/* ── Thumbnail ──────────────────────────────────────────────── */}
      <div className="relative h-48 w-full overflow-hidden bg-[#0a1120]">
        <img
          src={getThumbnail(submission.track, submission.thumbnailUrl)}
          alt={submission.title}
          onError={(e) => {
            e.target.onerror = null;
            // Fall back to track-specific image on load error
            e.target.src = TRACK_THUMBNAILS[submission.track] || '/thumbnails/thumb_default.jpg';
          }}
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500 opacity-90"
        />
        {/* bottom gradient so text is always readable */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d1424]/90 via-transparent to-transparent" />

        {/* Track badge */}
        <div className="absolute top-3 left-3 z-10">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold border backdrop-blur-md
                        shadow-[0_2px_8px_rgba(0,0,0,0.4)] ${getTrackBadgeColor(submission.track)}`}
          >
            {submission.track}
          </span>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 p-5 gap-2">
        <h3 className="font-bold text-[1.05rem] leading-snug text-blue-300 group-hover:text-blue-200 transition-colors line-clamp-2">
          {submission.title}
        </h3>

        <p className="text-[11px] font-medium text-slate-500">
          by{' '}
          <span className="text-slate-400">
            {submission.teamId?.name || submission.team?.name || '—'}
          </span>
        </p>

        <p className="text-[13px] text-slate-400 line-clamp-2 leading-relaxed mt-0.5">
          {submission.tagline}
        </p>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="px-5 pb-4 flex items-center justify-between border-t border-[#1e2d4a] pt-3">
        <div className="flex items-center gap-1.5">
          {submission.githubUrl && (
            <a
              href={submission.githubUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
              title="View Repository"
            >
              <Github className="w-4 h-4" />
            </a>
          )}
          {submission.demoVideoUrl && (
            <a
              href={submission.demoVideoUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
              title="Live Demo"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>

        <UpvoteWidget submission={submission} size="sm" />
      </div>
    </div>
  );
};
