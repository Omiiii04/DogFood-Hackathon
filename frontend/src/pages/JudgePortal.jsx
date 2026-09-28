import React, { useState, useEffect } from 'react';
import { useJudging } from '../hooks/useJudging';
import { RubricSlider } from '../components/RubricSlider';
import { PairwiseJudging } from '../components/PairwiseJudging';
import { useNotification } from '../context/NotificationContext';
import { Modal } from '../components/Modal';
import api from '../services/api';
import { CheckCircle, Clock, Send, Github, ExternalLink, Save } from 'lucide-react';
import { getTrackBadgeColor } from '../utils/formatters';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { HackathonListSection } from '../components/HackathonListSection';

export const JudgePortal = () => {
  const { queue, rubric, loading, error, refetch } = useJudging();
  const { addNotification } = useNotification();

  const [selectedItem, setSelectedItem]       = useState(null);
  const [criteriaScores, setCriteriaScores]   = useState({});
  const [privateNotes, setPrivateNotes]       = useState('');
  const [submitting, setSubmitting]           = useState(false);
  const [autoEvaluating, setAutoEvaluating]   = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [saveStatus, setSaveStatus]           = useState('');
  const [mode, setMode]                       = useState('rubric');

  useEffect(() => {
    if (selectedItem) {
      if (selectedItem.score?.criteriaScores?.length > 0) {
        const scoresMap = {};
        selectedItem.score.criteriaScores.forEach((cs) => {
          const key = cs.criteriaName || cs.key;
          const val = cs.rawScore !== undefined ? cs.rawScore : cs.score;
          if (key && val !== undefined) scoresMap[key] = val;
        });
        setCriteriaScores(scoresMap);
        setPrivateNotes(selectedItem.score.privateNotes || '');
      } else {
        const initialMap = {};
        rubric.forEach((crit) => { initialMap[crit.name] = 5.0; });
        setCriteriaScores(initialMap);
        const draftedNotes = localStorage.getItem(`draft_notes_${selectedItem.submission?._id}`);
        setPrivateNotes(selectedItem.score?.privateNotes || draftedNotes || '');
      }
    }
  }, [selectedItem, rubric]);

  useEffect(() => {
    if (queue.length > 0 && !selectedItem) setSelectedItem(queue[0]);
  }, [queue, selectedItem]);

  useEffect(() => {
    if (!selectedItem?.submission?._id || selectedItem?.status === 'completed' || selectedItem?.score?.isFinal) return;
    const timer = setTimeout(async () => {
      try {
        setSaveStatus('Saving draft…');
        const scoresPayload = rubric.map((crit) => ({
          criteriaName: crit.name, key: crit.key || crit.name, weight: crit.weight,
          rawScore: criteriaScores[crit.name] ?? 5.0,
          score:    criteriaScores[crit.name] ?? 5.0,
        }));
        await api.put('/judging/scores/draft', { submissionId: selectedItem.submission._id, criteriaScores: scoresPayload, privateNotes });
        setSaveStatus('Draft saved');
        setTimeout(() => setSaveStatus(''), 2000);
      } catch (err) {
        localStorage.setItem(`draft_notes_${selectedItem.submission._id}`, privateNotes);
        setSaveStatus('Saved locally');
        setTimeout(() => setSaveStatus(''), 2000);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [privateNotes, criteriaScores, selectedItem, rubric]);

  const handleSliderChange = (name, val) => setCriteriaScores((prev) => ({ ...prev, [name]: val }));

  const computeTotalWeightedScore = () => {
    if (!rubric.length) return 0;
    let totalScore = 0, totalWeight = 0;
    rubric.forEach((crit) => { const score = criteriaScores[crit.name] ?? 5.0; totalScore += score * crit.weight; totalWeight += crit.weight; });
    return Number((totalScore / (totalWeight || 1)).toFixed(2));
  };

  const handleSubmitBallot = async () => {
    if (!selectedItem?.submission?._id) return;
    setSubmitting(true);
    const scoresPayload = rubric.map((crit) => ({ criteriaName: crit.name, weight: crit.weight, rawScore: criteriaScores[crit.name] ?? 5.0 }));
    try {
      const res = await api.post('/judging/scores', { submissionId: selectedItem.submission._id, criteriaScores: scoresPayload, privateNotes });
      if (res.success) {
        addNotification('Evaluation ballot submitted!', 'success');
        localStorage.removeItem(`draft_notes_${selectedItem.submission._id}`);
        setShowConfirmModal(false);
        refetch();
      }
    } catch (err) { addNotification(err.message, 'error'); }
    finally { setSubmitting(false); }
  };

  const handleAutoEvaluate = async () => {
    const pendingCount = queue.filter((item) => item.status !== 'completed').length;
    if (pendingCount === 0) {
      addNotification('All submissions are already scored.', 'info');
      return;
    }
    if (!window.confirm(`Auto-evaluate ${pendingCount} pending submission(s) using the judging engine? Each will receive a median score of 5.0 across all rubric criteria.`)) return;
    setAutoEvaluating(true);
    try {
      const res = await api.post('/judging/auto-evaluate');
      if (res.success) {
        addNotification(res.message || `Auto-evaluation complete: ${res.data?.evaluated || 0} scored.`, 'success');
        setSelectedItem(null);
        refetch();
      }
    } catch (err) { addNotification(err.message || 'Auto-evaluation failed.', 'error'); }
    finally { setAutoEvaluating(false); }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center rounded-2xl bg-error-container/20 border border-error/30 text-error font-body-md text-body-md">
        {error}
      </div>
    );
  }

  const submission  = selectedItem?.submission;
  const currentTotal = computeTotalWeightedScore();

  const statusInfo = (item) => {
    if (item.status === 'completed') return { icon: <CheckCircle className="w-3.5 h-3.5" />, label: 'Scored',     cls: 'text-status-success' };
    if (item.status === 'in_progress') return { icon: <Clock className="w-3.5 h-3.5" />,       label: 'In Progress', cls: 'text-primary' };
    return { icon: <Clock className="w-3.5 h-3.5" />, label: 'Pending', cls: 'text-status-warning' };
  };

  return (
    <div className="space-y-6 py-8 px-4 md:px-0 max-w-[1280px] mx-auto">
      {/* Page Header */}
      <div className="pb-6 border-b border-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-tertiary font-label-caps text-label-caps font-bold uppercase tracking-wider mb-2">
            <span className="material-symbols-outlined text-[15px]">gavel</span>
            <span>Judge Evaluation Console</span>
          </div>
          <h1 className="font-headline-md text-headline-md text-on-surface font-extrabold tracking-tight">Assigned Evaluation Queue</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Evaluate projects against the official weighted rubric criteria.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode toggle */}
          <div className="flex bg-surface-container-low rounded-xl p-1 border border-outline-variant/60 gap-0.5">
            {[{ id: 'rubric', label: 'Rubric Mode', icon: 'rule' }, { id: 'pairwise', label: 'Pairwise A/B', icon: 'compare' }].map(({ id, label, icon }) => (
              <button
                key={id} onClick={() => setMode(id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-label-caps text-label-caps font-bold transition-all ${
                  mode === id
                    ? 'bg-primary-container text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">{icon}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          {/* Auto Evaluate Engine button */}
          {queue.some((item) => item.status !== 'completed') && (
            <button
              id="auto-evaluate-btn"
              onClick={handleAutoEvaluate}
              disabled={autoEvaluating}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-secondary-container/30 border border-secondary/30 text-secondary font-label-caps text-label-caps font-bold hover:bg-secondary-container/50 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {autoEvaluating
                ? <div className="w-3.5 h-3.5 border-2 border-secondary/30 border-t-secondary rounded-full animate-spin" />
                : <span className="material-symbols-outlined text-[14px]">auto_awesome</span>}
              <span className="hidden sm:inline">{autoEvaluating ? 'Evaluating…' : 'Auto Evaluate'}</span>
            </button>
          )}
          <div className="px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/60 font-label-caps text-label-caps text-on-surface-variant">
            Queue: <span className="font-bold text-on-surface">{queue.length}</span> Projects
          </div>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="rounded-2xl bg-surface-container-low border border-surface-container overflow-hidden">
          {/* Top banner */}
          <div className="px-8 py-8 text-center border-b border-surface-container">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-[30px] text-primary">inbox</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-2">
              No Projects in Your Evaluation Queue
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-md mx-auto">
              Your queue is empty. This is usually because the organiser hasn't assigned submissions to you yet, or no submissions have been locked for evaluation.
            </p>
          </div>
          {/* Process steps */}
          <div className="px-8 py-6">
            <p className="font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-4 text-center">
              How the judging flow works
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: 'edit_note',       step: '1', label: 'Teams Submit',      desc: 'Participants finalize and lock their project submissions.' },
                { icon: 'assignment_ind',  step: '2', label: 'Organiser Assigns', desc: 'The organiser assigns locked submissions to judge queues.' },
                { icon: 'gavel',           step: '3', label: 'Judges Evaluate',   desc: 'Assigned projects appear here for your rubric scoring.' },
              ].map(({ icon, step, label, desc }) => (
                <div key={step} className="flex flex-col items-center text-center p-4 rounded-xl bg-surface-container-lowest border border-surface-container">
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                    <span className="material-symbols-outlined text-[18px] text-primary">{icon}</span>
                  </div>
                  <div className="font-label-caps text-[10px] text-primary font-bold uppercase tracking-wider mb-1">Step {step}</div>
                  <div className="font-title-md text-title-md text-on-surface font-semibold mb-1">{label}</div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{desc}</p>
                </div>
              ))}
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant text-center mt-5 italic">
              Please check back after the organiser has run judge assignments.
            </p>
          </div>
        </div>
      ) : mode === 'pairwise' ? (
        <PairwiseJudging queue={queue} rubric={rubric} refetch={refetch} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Queue sidebar */}
          <div className="lg:col-span-3 space-y-2">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-3 px-1">
              Assigned Queue
            </h3>
            {queue.map((item) => {
              const isSelected = selectedItem?.assignmentId === item.assignmentId;
              const { icon, label, cls } = statusInfo(item);
              return (
                <div
                  key={item.assignmentId}
                  onClick={() => setSelectedItem(item)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all hover:-translate-y-0.5 ${
                    isSelected
                      ? 'bg-primary/6 border-primary shadow-[0_0_0_2px_rgba(30,96,255,0.15)]'
                      : 'bg-surface-container-lowest border-surface-container hover:border-outline-variant hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getTrackBadgeColor(item.track)}`}>
                      {item.track}
                    </span>
                    <span className={`flex items-center gap-1 font-label-caps text-label-caps font-bold ${cls}`}>
                      {icon}<span>{label}</span>
                    </span>
                  </div>
                  <h4 className="font-title-md text-title-md text-on-surface font-semibold line-clamp-1 mt-1">
                    {item.submission?.title || 'Untitled Project'}
                  </h4>
                </div>
              );
            })}
          </div>

          {/* Main content */}
          <div className="lg:col-span-9 bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm p-6">
            {submission ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Briefing Panel */}
                <div className="space-y-5 lg:border-r lg:border-surface-container lg:pr-8">
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-1">{submission.title}</h2>
                    <p className="font-body-md text-body-md text-on-surface-variant mb-5">{submission.tagline}</p>

                    <div className="flex items-center gap-2.5 mb-5">
                      {(submission.githubUrl || submission.repoUrl) && (
                        <a href={submission.githubUrl || submission.repoUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/60 text-on-surface-variant hover:text-on-surface font-label-caps text-label-caps font-semibold transition-all hover:border-outline"
                        >
                          <Github className="w-3.5 h-3.5" /><span>Repository</span>
                        </a>
                      )}
                      {(submission.demoVideoUrl || submission.demoUrl) && (
                        <a href={submission.demoVideoUrl || submission.demoUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/60 text-on-surface-variant hover:text-on-surface font-label-caps text-label-caps font-semibold transition-all hover:border-outline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /><span>Demo</span>
                        </a>
                      )}
                    </div>

                    <div className="prose-stitch text-sm max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked(submission.description || '')) }} />
                    </div>
                  </div>
                </div>

                {/* Rubric Panel */}
                <div className="space-y-5 sticky top-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider">Rubric Scoring</h3>
                    <div className="text-right">
                      <span className="font-body-sm text-body-sm text-on-surface-variant mr-1.5">Composite:</span>
                      <span className="font-headline-sm text-headline-sm font-extrabold text-status-success">{currentTotal}<span className="text-on-surface-variant font-normal text-sm"> / 10</span></span>
                    </div>
                  </div>

                  <div className="space-y-3 p-4 rounded-xl bg-surface-container-low border border-surface-container">
                    {rubric.map((criterion) => (
                      <RubricSlider key={criterion.name} criterion={criterion} value={criteriaScores[criterion.name]} onChange={handleSliderChange} />
                    ))}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider">
                        Private Evaluator Notes
                      </label>
                      {saveStatus && (
                        <span className="flex items-center gap-1 font-label-caps text-label-caps text-primary">
                          <Save className="w-3 h-3" /><span>{saveStatus}</span>
                        </span>
                      )}
                    </div>
                    <textarea
                      rows={4} value={privateNotes}
                      onChange={(e) => setPrivateNotes(e.target.value)}
                      placeholder="Enter confidential evaluation feedback…"
                      className="w-full p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/60 text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 resize-none transition-all"
                    />
                  </div>

                  <div className="pt-4 border-t border-surface-container flex justify-end">
                    <button
                      onClick={() => setShowConfirmModal(true)}
                      disabled={submitting || selectedItem?.status === 'completed'}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.25)] hover:bg-primary active:scale-[0.98] transition-all disabled:opacity-60"
                    >
                      <Send className="w-4 h-4" />
                      <span>{selectedItem?.status === 'completed' ? 'Ballot Recorded' : 'Submit Final Ballot'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center">
                <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-3 block">touch_app</span>
                <p className="font-body-md text-body-md text-on-surface-variant">Select a project from the queue to begin scoring.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirmModal && (
        <Modal onClose={() => !submitting && setShowConfirmModal(false)}>
          <div className="p-2 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px] text-primary">gavel</span>
              </div>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Confirm Final Ballot</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">This action cannot be undone.</p>
              </div>
            </div>

            <p className="font-body-md text-body-md text-on-surface-variant">
              You are submitting your final evaluation for{' '}
              <strong className="text-on-surface">{submission?.title}</strong>.
              The weighted composite score will be sealed and recorded.
            </p>

            <div className="bg-surface-container-low border border-surface-container rounded-2xl p-5 text-center">
              <div className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-1">Weighted Composite Score</div>
              <div className="font-headline-lg text-headline-lg font-extrabold text-status-success">{currentTotal}<span className="text-on-surface-variant font-normal text-base"> / 10</span></div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-container">
              <button
                onClick={() => setShowConfirmModal(false)} disabled={submitting}
                className="px-4 py-2 rounded-xl font-title-md text-title-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all disabled:opacity-60"
              >
                Review Again
              </button>
              <button
                onClick={handleSubmitBallot} disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.22)] hover:bg-primary active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {submitting && <div className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />}
                <span>{submitting ? 'Submitting…' : 'Confirm Submission'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      <HackathonListSection
        title="All Hackathons"
        subtitle="See every active competition — review at a glance while between evaluation sessions."
      />
    </div>
  );
};
