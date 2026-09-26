import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNotification } from '../context/NotificationContext';
import { renderMarkdownToSafeHTML } from '../utils/markdownSanitizer';
import api from '../services/api';
import { Save, Lock, Upload, Eye, FileText, HardDrive } from 'lucide-react';
import { Link } from 'react-router-dom';

const DRAFT_KEY = 'dogfood_sub_draft';
const DEFAULT_MARKDOWN = `# Project Overview\n\n### What it does\nExplain the core value proposition of your project.\n\n### How we built it\nDescribe your technical architecture, models, and tools.\n\n### Challenges we ran into\nDetail technical bottlenecks and how you solved them.`;

export const SubmissionEditor = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [hasTeam, setHasTeam] = useState(true);
  const [localDraftSaved, setLocalDraftSaved] = useState(false);

  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [track, setTrack] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [thumbnailPath, setThumbnailPath] = useState('/uploads/default-thumbnail.webp');
  const [status, setStatus] = useState('draft');

  useEffect(() => {
    const fetchSubmission = async () => {
      try {
        const teamRes = await api.get('/teams/my-team');
        if (!teamRes.data?.team) {
          setHasTeam(false);
          setLoading(false);
          return;
        }

        setTrack(teamRes.data.team.track || '');

        const sub = teamRes.data.submission;
        if (sub) {
          setTitle(sub.title || '');
          setTagline(sub.tagline || '');
          setRepoUrl(sub.githubUrl || '');
          setDemoUrl(sub.demoVideoUrl || '');
          setMarkdown(sub.description || '');
          setThumbnailPath(sub.thumbnailUrl || '/uploads/default-thumbnail.webp');
          setStatus(sub.status || 'draft');
          localStorage.removeItem(DRAFT_KEY);
        } else {
          const saved = localStorage.getItem(DRAFT_KEY);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              setTitle(parsed.title || '');
              setTagline(parsed.tagline || '');
              setRepoUrl(parsed.repoUrl || '');
              setDemoUrl(parsed.demoUrl || '');
              setMarkdown(parsed.markdown || DEFAULT_MARKDOWN);
            } catch {
              setMarkdown(DEFAULT_MARKDOWN);
            }
          } else {
            setMarkdown(DEFAULT_MARKDOWN);
          }
        }
      } catch (err) {
        addNotification(err.message, 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchSubmission();
  }, [addNotification]);

  useEffect(() => {
    if (status === 'submitted' || status === 'locked' || loading) return;
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, tagline, repoUrl, demoUrl, markdown }));
      setLocalDraftSaved(true);
      setTimeout(() => setLocalDraftSaved(false), 2500);
    }, 800);
    return () => clearTimeout(timer);
  }, [title, tagline, repoUrl, demoUrl, markdown, status, loading]);

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const res = await api.post('/submissions', {
        title,
        tagline,
        repoUrl,
        demoUrl,
        descriptionMarkdown: markdown,
        thumbnailPath,
      });
      if (res.success) {
        addNotification('Draft saved successfully!', 'success');
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (err) {
      addNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('thumbnail', file);

    try {
      const res = await api.post('/submissions/upload-thumbnail', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.success && res.data?.filePath) {
        setThumbnailPath(res.data.filePath);
        addNotification('Thumbnail uploaded!', 'success');
      }
    } catch (err) {
      addNotification(err.message, 'error');
    }
  };

  const handleFinalize = async () => {
    if (!window.confirm('Are you sure you want to finalize? This locks your project for judging evaluation.')) {
      return;
    }

    setFinalizing(true);
    try {
      const saveRes = await api.post('/submissions', {
        title,
        tagline,
        repoUrl,
        demoUrl,
        descriptionMarkdown: markdown,
        thumbnailPath,
      });

      const submissionId = saveRes?.data?.submission?._id;
      const res = submissionId
        ? await api.post(`/submissions/${submissionId}/finalize`)
        : await api.post('/submissions/finalize');
      if (res.success) {
        setStatus('submitted');
        localStorage.removeItem(DRAFT_KEY);
        addNotification('Project finalized and locked for evaluation!', 'success');
      }
    } catch (err) {
      addNotification(err.message, 'error');
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!hasTeam) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <h2 className="text-2xl font-bold text-white">No Team Found</h2>
        <p className="text-sm text-gray-400">
          You need to create or join a team before submitting a hackathon project.
        </p>
        <Link
          to="/team"
          className="inline-block px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-glow transition-all"
        >
          Go to Team Dashboard
        </Link>
      </div>
    );
  }

  const isLocked = status === 'submitted' || status === 'locked';

  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border-subtle">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-3xl font-extrabold text-white">Project Submission Editor</h1>
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase ${
                isLocked
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}
            >
              {isLocked ? 'Locked for Evaluation' : 'Draft Mode'}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Dual-pane live markdown editor with attachment uploads.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {localDraftSaved && (
            <span className="flex items-center space-x-1.5 text-xs text-emerald-400 font-mono">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Draft saved locally</span>
            </span>
          )}
          {!isLocked && (
            <>
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border-subtle text-gray-200 hover:text-white font-semibold text-sm flex items-center space-x-2 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4 text-blue-400" />
                <span>{saving ? 'Saving...' : 'Save Draft'}</span>
              </button>

              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-glow flex items-center space-x-2 transition-all disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>{finalizing ? 'Finalizing...' : 'Finalize Project'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="bg-surface border border-border-subtle rounded-2xl p-6 space-y-5">
          <h2 className="text-base font-bold text-white flex items-center space-x-2 pb-3 border-b border-border-subtle">
            <FileText className="w-4 h-4 text-blue-400" />
            <span>Metadata & Narrative Editor</span>
          </h2>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Project Title</label>
            <input
              type="text"
              disabled={isLocked}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Neural Raptor"
              className="w-full px-3.5 py-2 rounded-xl bg-canvas border border-border-subtle text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Pitch (140 chars)</label>
            <input
              type="text"
              disabled={isLocked}
              maxLength={140}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Autonomous air-gapped machine learning submission evaluator"
              className="w-full px-3.5 py-2 rounded-xl bg-canvas border border-border-subtle text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
            />
            <div className="flex justify-end mt-1">
              <span className={`text-xs font-mono ${tagline.length >= 130 ? 'text-amber-400' : 'text-gray-500'}`}>
                {tagline.length}/140
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Competition Track</label>
            <div className="w-full px-3.5 py-2 rounded-xl bg-canvas border border-border-subtle text-sm text-gray-400 font-mono">
              {track || '—'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">GitHub Repository URL</label>
              <input
                type="text"
                disabled={isLocked}
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/..."
                className="w-full px-3.5 py-2 rounded-xl bg-canvas border border-border-subtle text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Demo Video URL (Optional)</label>
              <input
                type="text"
                disabled={isLocked}
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                placeholder="http://localhost:3000/demo"
                className="w-full px-3.5 py-2 rounded-xl bg-canvas border border-border-subtle text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Thumbnail Cover Image</label>
            <div className="flex items-center space-x-4">
              <img
                src={thumbnailPath}
                alt="Preview"
                className="w-16 h-16 rounded-xl object-cover border border-border-subtle bg-surface-raised"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%230f172a'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' fill='%234b5563' font-size='9' font-family='monospace'%3ENo Image%3C/text%3E%3C/svg%3E";
                }}
              />
              {!isLocked && (
                <label className="px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border-subtle text-xs font-semibold text-gray-200 cursor-pointer flex items-center space-x-2 transition-colors">
                  <Upload className="w-4 h-4 text-blue-400" />
                  <span>Upload Local Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Markdown Documentation</label>
            <textarea
              rows={14}
              disabled={isLocked}
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              placeholder="Write your markdown description..."
              className="w-full p-4 rounded-xl bg-canvas border border-border-subtle text-sm text-white font-mono leading-relaxed focus:outline-none focus:border-blue-500 disabled:opacity-60 resize-y"
            />
          </div>
        </div>

        <div className="bg-surface border border-border-subtle rounded-2xl p-6 space-y-5 sticky top-24">
          <h2 className="text-base font-bold text-white flex items-center space-x-2 pb-3 border-b border-border-subtle">
            <Eye className="w-4 h-4 text-emerald-400" />
            <span>Live Sanitized Preview</span>
          </h2>

          <div className="space-y-4">
            <div>
              <h3 className="text-2xl font-extrabold text-white">
                {title || 'Untitled Hackathon Project'}
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                {tagline || 'No tagline provided yet.'}
              </p>
            </div>

            <div className="pt-4 border-t border-border-subtle">
              <div
                className="prose prose-invert max-w-none text-sm text-gray-300 leading-relaxed space-y-3"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownToSafeHTML(markdown),
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
