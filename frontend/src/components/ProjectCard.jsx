import React from 'react';
import { ExternalLink, Github } from 'lucide-react';
import { getTrackBadgeColor } from '../utils/formatters';
import { UpvoteWidget } from './UpvoteWidget';

const THUMBNAIL_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='176'%3E%3Crect width='600' height='176' fill='%230f172a'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%234b5563' font-size='12' font-family='monospace'%3ENo Preview%3C/text%3E%3C/svg%3E";

export const ProjectCard = ({ submission, onOpenModal }) => {
  return (
    <div
      onClick={() => onOpenModal && onOpenModal(submission)}
      className="group relative bg-surface border border-border-subtle rounded-xl overflow-hidden hover:border-blue-500/50 hover:shadow-card transition-all duration-300 flex flex-col cursor-pointer"
    >
      <div className="relative h-44 w-full bg-surface-raised overflow-hidden">
        <img
          src={submission.thumbnailUrl || '/uploads/default-thumbnail.webp'}
          alt={submission.title}
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = THUMBNAIL_FALLBACK;
          }}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-3 left-3">
          <span
            className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold border backdrop-blur-md ${getTrackBadgeColor(
              submission.track
            )}`}
          >
            {submission.track}
          </span>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors line-clamp-1">
              {submission.title}
            </h3>
          </div>
          <p className="text-xs font-medium text-gray-400 mb-2">
            by <span className="text-gray-200">{submission.teamId?.name || submission.team?.name || '—'}</span>
          </p>
          <p className="text-sm text-gray-300 line-clamp-2 mb-4 leading-relaxed">
            {submission.tagline}
          </p>
        </div>

        <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center space-x-2">
            {submission.githubUrl && (
              <a
                href={submission.githubUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-lg hover:bg-surface-raised hover:text-white transition-colors"
                title="View Code Repository"
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
                className="p-1.5 rounded-lg hover:bg-surface-raised hover:text-white transition-colors"
                title="Live Demo"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>

          <UpvoteWidget submission={submission} size="sm" />
        </div>
      </div>
    </div>
  );
};
