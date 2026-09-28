import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNotification } from '../context/NotificationContext';
import { renderMarkdownToSafeHTML } from '../utils/markdownSanitizer';
import api from '../services/api';
import { Save, Lock, Upload, Eye, FileText, HardDrive, Trophy, CheckCircle2, MessageSquare, ExternalLink, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const DRAFT_KEY = 'dogfood_sub_draft';
const DEFAULT_MARKDOWN = `# Project Overview\n\n### What it does\nExplain the core value proposition of your project.\n\n### How we built it\nDescribe your technical architecture, models, and tools.\n\n### Challenges we ran into\nDetail technical bottlenecks and how you solved them.`;

export const SubmissionEditor = () => {
  const { user }            = useAuth();
  const { addNotification } = useNotification();

  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [finalizing, setFinalizing]     = useState(false);
  const [hasTeam, setHasTeam]           = useState(true);
  const [localDraftSaved, setLocalDraftSaved] = useState(false);
  const [evaluation, setEvaluation]     = useState(null);

  const [title, setTitle]         = useState('');
  const [tagline, setTagline]     = useState('');
  const [track, setTrack]         = useState('');
  const [repoUrl, setRepoUrl]     = useState('');
  const [demoUrl, setDemoUrl]     = useState('');
  const [markdown, setMarkdown]   = useState('');
  const [thumbnailPath, setThumbnailPath] = useState('/uploads/default-thumbnail.webp');
  const [status, setStatus]       = useState('draft');

  const fetchSubmission = useCallback(async () => {
    try {
      const teamRes = await api.get('/teams/my-team');
      if (!teamRes.data?.team) { setHasTeam(false); setLoading(false); return; }
      setTrack(teamRes.data.team.track || '');
      const sub = teamRes.data.submission;
      if (sub) {
        setTitle(sub.title || '');
        setTagline(sub.tagline || '');
        setRepoUrl(sub.githubUrl || sub.repoUrl || '');
        setDemoUrl(sub.demoVideoUrl || sub.demoUrl || '');
        setMarkdown(sub.description || sub.descriptionMarkdown || '');
        setThumbnailPath(sub.thumbnailUrl || sub.thumbnailPath || '/uploads/default-thumbnail.webp');
        setStatus(sub.status || 'draft');
        setEvaluation(sub.evaluation || teamRes.data?.evaluation || null);
        localStorage.removeItem(DRAFT_KEY);
      } else {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setTitle(parsed.title || ''); setTagline(parsed.tagline || '');
            setRepoUrl(parsed.repoUrl || ''); setDemoUrl(parsed.demoUrl || '');
            setMarkdown(parsed.markdown || DEFAULT_MARKDOWN);
          } catch { setMarkdown(DEFAULT_MARKDOWN); }
        } else { setMarkdown(DEFAULT_MARKDOWN); }
      }
    } catch (err) { addNotification(err.message, 'error'); }
    finally { setLoading(false); }
  }, [addNotification]);

  useEffect(() => { fetchSubmission(); }, [fetchSubmission]);

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
      const res = await api.post('/submissions', { title, tagline, repoUrl, demoUrl, descriptionMarkdown: markdown, thumbnailPath });
      if (res.success) { addNotification('Draft saved!', 'success'); localStorage.removeItem(DRAFT_KEY); await fetchSubmission(); }
    } catch (err) { addNotification(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('thumbnail', file);
    try {
      const res = await api.post('/submissions/upload-thumbnail', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.success && res.data?.filePath) { setThumbnailPath(res.data.filePath); addNotification('Thumbnail uploaded!', 'success'); }
    } catch (err) { addNotification(err.message, 'error'); }
  };

  const handleFinalize = async () => {
    if (!window.confirm('Finalize? This locks your project for judging and cannot be undone.')) return;
    setFinalizing(true);
    try {
      const saveRes = await api.post('/submissions', { title, tagline, repoUrl, demoUrl, descriptionMarkdown: markdown, thumbnailPath });
      const submissionId = saveRes?.data?.submission?._id;
      const res = submissionId
        ? await api.post(`/submissions/${submissionId}/finalize`)
        : await api.post('/submissions/finalize');
      if (res.success) { localStorage.removeItem(DRAFT_KEY); addNotification('Project finalized and locked!', 'success'); await fetchSubmission(); }
    } catch (err) { addNotification(err.message, 'error'); }
    finally { setFinalizing(false); }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasTeam) {
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-5 px-4">
        <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center mx-auto border border-outline-variant/60">
          <span className="material-symbols-outlined text-[32px] text-on-surface-variant">group_off</span>
        </div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">No Team Found</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          You need to create or join a team before submitting a project.
        </p>
        <Link
          to="/team"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.25)] hover:bg-primary active:scale-[0.98] transition-all"
        >
          Go to Team Dashboard
        </Link>
      </div>
    );
  }

  const isLocked = status === 'submitted' || status === 'locked';

  return (
    <div className="space-y-6 py-8 px-4 md:px-0 max-w-[1280px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-surface-container">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-primary font-label-caps text-label-caps font-bold uppercase tracking-wider">
              <FileText className="w-3.5 h-3.5" />
              <span>Submission Portal</span>
            </div>
            {evaluation ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full font-label-caps text-label-caps font-bold bg-status-success/15 border border-status-success/30 text-status-success">
                <Trophy className="w-3.5 h-3.5 text-status-success" />
                Evaluation Complete · {Number(evaluation.compositeScore).toFixed(1)}/10
              </span>
            ) : (
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-caps text-label-caps font-bold ${
                isLocked
                  ? 'bg-status-success/10 border border-status-success/30 text-status-success'
                  : 'bg-status-warning/10 border border-status-warning/30 text-status-warning'
              }`}>
                <span className="material-symbols-outlined text-[12px]">{isLocked ? 'lock' : 'edit'}</span>
                {isLocked ? 'Locked for Evaluation' : 'Draft Mode'}
              </span>
            )}
          </div>
          <h1 className="font-headline-md text-headline-md text-on-surface font-extrabold tracking-tight">Project Submission Editor</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Live markdown editor with attachment uploads and sanitized preview.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {localDraftSaved && (
            <span className="flex items-center gap-1.5 font-body-sm text-body-sm text-status-success">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Draft saved locally</span>
            </span>
          )}
          {!isLocked && (
            <>
              <button
                onClick={handleSaveDraft} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant text-on-surface font-title-md text-title-md font-semibold hover:border-outline active:scale-[0.98] transition-all disabled:opacity-60"
              >
                <Save className="w-4 h-4 text-primary" />
                <span>{saving ? 'Saving…' : 'Save Draft'}</span>
              </button>
              <button
                onClick={handleFinalize} disabled={finalizing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.25)] hover:bg-primary active:scale-[0.98] transition-all disabled:opacity-60"
              >
                <Lock className="w-4 h-4" />
                <span>{finalizing ? 'Finalizing…' : 'Finalize Project'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Official Evaluation Banner (when evaluated by judge) */}
      {evaluation && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-status-success/15 via-primary/10 to-surface-container-low border border-status-success/30 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-status-success/20 border border-status-success/40 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5 text-status-success" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-title-md text-title-md text-on-surface font-bold">
                  Official Evaluation Ballot Recorded
                </h3>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-status-success/20 text-status-success border border-status-success/30">
                  {Number(evaluation.compositeScore).toFixed(1)} / 10.0
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                {evaluation.feedback?.[0]?.notes
                  ? `Judge Review: "${evaluation.feedback[0].notes}"`
                  : 'Your project evaluation has been completed by the evaluation committee.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/team"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container border border-outline-variant text-on-surface font-title-md text-title-md font-semibold transition-all shadow-sm"
            >
              <span>View Full Rubric</span>
              <ArrowRight className="w-4 h-4 text-primary" />
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Editor Panel */}
        <div className="bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm p-6 space-y-5">
          <h2 className="font-title-md text-title-md text-on-surface font-bold flex items-center gap-2 pb-4 border-b border-surface-container">
            <FileText className="w-4 h-4 text-primary" />
            Metadata & Narrative Editor
          </h2>

          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Project Title</label>
            <input
              type="text" disabled={isLocked} value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Neural Raptor"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60 text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Pitch (140 chars)</label>
            <input
              type="text" disabled={isLocked} maxLength={140} value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Autonomous air-gapped ML evaluation"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60 text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <div className="flex justify-end mt-1">
              <span className={`font-label-caps text-label-caps font-semibold ${tagline.length >= 130 ? 'text-status-warning' : 'text-on-surface-variant'}`}>
                {tagline.length}/140
              </span>
            </div>
          </div>

          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Competition Track</label>
            <div className="px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 font-body-md text-body-md text-on-surface-variant font-mono">
              {track || '—'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">GitHub Repository URL</label>
              <input
                type="text" disabled={isLocked} value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60 text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Demo Video URL (Optional)</label>
              <input
                type="text" disabled={isLocked} value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                placeholder="http://localhost:3000/demo"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60 text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Thumbnail Cover Image</label>
            <div className="flex items-center gap-4">
              <img
                src={thumbnailPath} alt="Preview"
                className="w-16 h-16 rounded-xl object-cover border border-outline-variant/60 bg-surface-container-low shadow-sm"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23eff4ff'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' fill='%23737687' font-size='9' font-family='monospace'%3ENo Image%3C/text%3E%3C/svg%3E";
                }}
              />
              {!isLocked && (
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant font-label-caps text-label-caps text-on-surface-variant hover:text-on-surface cursor-pointer transition-all">
                  <Upload className="w-4 h-4 text-primary" />
                  <span>Upload Local Image</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Markdown Documentation</label>
            <textarea
              rows={14} disabled={isLocked} value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              placeholder="Write your markdown description..."
              className="w-full p-4 rounded-xl bg-surface-container-low border border-outline-variant/60 text-sm text-on-surface font-mono leading-relaxed focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60 disabled:cursor-not-allowed resize-y transition-all"
            />
          </div>
        </div>

        {/* Preview Panel */}
        <div className="bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm p-6 space-y-5 sticky top-24">
          <h2 className="font-title-md text-title-md text-on-surface font-bold flex items-center gap-2 pb-4 border-b border-surface-container">
            <Eye className="w-4 h-4 text-status-success" />
            Live Sanitized Preview
          </h2>

          <div className="space-y-4">
            <div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-extrabold">
                {title || 'Untitled Hackathon Project'}
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                {tagline || 'No tagline provided yet.'}
              </p>
              {track && (
                <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full bg-primary/8 border border-primary/20 font-label-caps text-label-caps text-primary font-bold">
                  <span className="material-symbols-outlined text-[13px]">category</span>
                  {track}
                </span>
              )}
            </div>

            <div className="pt-4 border-t border-surface-container">
              <div
                className="prose-stitch text-sm leading-relaxed space-y-3 max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdownToSafeHTML(markdown) }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
