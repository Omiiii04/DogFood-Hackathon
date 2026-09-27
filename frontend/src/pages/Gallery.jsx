import React, { useState } from 'react';
import { useSubmissions } from '../hooks/useSubmissions';
import { ProjectCard } from '../components/ProjectCard';
import { Modal } from '../components/Modal';
import { renderMarkdownToSafeHTML } from '../utils/markdownSanitizer';
import { Search, Filter, Github, ExternalLink, Sparkles } from 'lucide-react';
import { getTrackBadgeColor } from '../utils/formatters';

const TRACKS = ['All', 'AI/ML', 'Web3 & Blockchain', 'FinTech', 'HealthTech'];
const THUMBNAIL_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='240'%3E%3Crect width='600' height='240' fill='%230f172a'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%234b5563' font-size='14' font-family='monospace'%3ENo Preview%3C/text%3E%3C/svg%3E";

export const Gallery = () => {
  const [selectedTrack, setSelectedTrack] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);

  const { submissions, loading, error } = useSubmissions(selectedTrack, searchQuery);

  return (
    <div className="space-y-8 py-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-blue-400 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Tournament Submissions</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white">Project Showcase Gallery</h1>
          <p className="text-sm text-gray-400 mt-1">
            Browse, explore, and upvote hackathon projects across all competition tracks.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title, keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border-subtle text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-none">
        <Filter className="w-4 h-4 text-gray-400 shrink-0 mr-1" />
        {TRACKS.map((track) => (
          <button
            key={track}
            onClick={() => setSelectedTrack(track)}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              selectedTrack === track
                ? 'bg-blue-600 text-white shadow-glow'
                : 'bg-surface border border-border-subtle text-gray-300 hover:text-white hover:bg-surface-raised'
            }`}
          >
            {track}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-80 rounded-xl bg-surface border border-border-subtle animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center rounded-2xl bg-rose-950/20 border border-rose-800 text-rose-300 text-sm">
          Failed to load gallery: {error}
        </div>
      ) : submissions.length === 0 ? (
        <div className="p-16 text-center rounded-2xl bg-surface border border-border-subtle">
          <p className="text-gray-400 text-sm">No submissions found matching your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {submissions.map((sub) => (
            <ProjectCard
              key={sub._id}
              submission={sub}
              onOpenModal={(project) => setSelectedProject(project)}
            />
          ))}
        </div>
      )}

      {selectedProject && (
        <Modal
          isOpen={!!selectedProject}
          onClose={() => setSelectedProject(null)}
          title={selectedProject.title}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-6">
            <div className="relative h-60 w-full rounded-xl overflow-hidden bg-surface-raised">
              <img
                src={selectedProject.thumbnailUrl || '/uploads/default-thumbnail.webp'}
                alt={selectedProject.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = THUMBNAIL_FALLBACK;
                }}
              />
              <div className="absolute top-4 left-4">
                <span
                  className={`px-3 py-1 rounded-lg text-xs font-bold border backdrop-blur-md ${getTrackBadgeColor(
                    selectedProject.track
                  )}`}
                >
                  {selectedProject.track}
                </span>
              </div>
            </div>

            <div>
              <p className="text-base text-gray-300 font-medium">{selectedProject.tagline}</p>
              <p className="text-xs text-gray-400 mt-1">
                Submitted by team{' '}
                <strong className="text-gray-200">
                  {selectedProject.teamId?.name || selectedProject.team?.name || '—'}
                </strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border-subtle">
              {selectedProject.githubUrl && (
                <a
                  href={selectedProject.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-lg bg-surface-raised border border-border-subtle hover:border-gray-500 text-sm font-semibold text-white flex items-center space-x-2 transition-colors"
                >
                  <Github className="w-4 h-4" />
                  <span>GitHub Repository</span>
                </a>
              )}
              {selectedProject.demoVideoUrl && (
                <a
                  href={selectedProject.demoVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white flex items-center space-x-2 transition-colors shadow-glow"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Live Demo</span>
                </a>
              )}
            </div>

            <div className="border-t border-border-subtle pt-6">
              <h4 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono mb-3">
                Project Narrative & Architectural Details
              </h4>
              <div
                className="prose prose-invert max-w-none text-sm text-gray-300 leading-relaxed space-y-3"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownToSafeHTML(selectedProject.description),
                }}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
