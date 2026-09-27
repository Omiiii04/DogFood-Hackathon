import React, { useState, useEffect } from 'react';
import { useJudging } from '../hooks/useJudging';
import { RubricSlider } from '../components/RubricSlider';
import { useNotification } from '../context/NotificationContext';
import { Modal } from '../components/Modal';
import api from '../services/api';
import { Award, CheckCircle, Clock, Send, Github, ExternalLink, Save } from 'lucide-react';
import { getTrackBadgeColor } from '../utils/formatters';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export const JudgePortal = () => {
  const { queue, rubric, loading, error, refetch } = useJudging();
  const { addNotification } = useNotification();

  const [selectedItem, setSelectedItem] = useState(null);
  const [criteriaScores, setCriteriaScores] = useState({});
  const [privateNotes, setPrivateNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    if (selectedItem) {
      if (selectedItem.score) {
        const scoresMap = {};
        selectedItem.score.criteriaScores.forEach((cs) => {
          scoresMap[cs.criteriaName] = cs.rawScore;
        });
        setCriteriaScores(scoresMap);
        setPrivateNotes(selectedItem.score.privateNotes || '');
      } else {
        const initialMap = {};
        rubric.forEach((crit) => {
          initialMap[crit.name] = 5.0;
        });
        setCriteriaScores(initialMap);
        const draftedNotes = localStorage.getItem(`draft_notes_${selectedItem.submission?._id}`);
        setPrivateNotes(draftedNotes || '');
      }
    }
  }, [selectedItem, rubric]);

  useEffect(() => {
    if (queue.length > 0 && !selectedItem) {
      setSelectedItem(queue[0]);
    }
  }, [queue, selectedItem]);

  useEffect(() => {
    if (!selectedItem?.submission?._id || selectedItem?.score) return;
    const timer = setTimeout(() => {
      localStorage.setItem(`draft_notes_${selectedItem.submission._id}`, privateNotes);
      setSaveStatus('Draft saved');
      setTimeout(() => setSaveStatus(''), 2000);
    }, 1000);
    return () => clearTimeout(timer);
  }, [privateNotes, selectedItem]);

  const handleSliderChange = (name, val) => {
    setCriteriaScores((prev) => ({ ...prev, [name]: val }));
  };

  const computeTotalWeightedScore = () => {
    if (!rubric.length) return 0;
    let totalScore = 0;
    let totalWeight = 0;

    rubric.forEach((crit) => {
      const score = criteriaScores[crit.name] || 5.0;
      totalScore += score * crit.weight;
      totalWeight += crit.weight;
    });

    return Number((totalScore / (totalWeight || 1)).toFixed(2));
  };

  const handleSubmitBallot = async () => {
    if (!selectedItem?.submission?._id) return;
    setSubmitting(true);

    const scoresPayload = rubric.map((crit) => ({
      criteriaName: crit.name,
      weight: crit.weight,
      rawScore: criteriaScores[crit.name] || 5.0,
    }));

    try {
      const res = await api.post('/judging/scores', {
        submissionId: selectedItem.submission._id,
        criteriaScores: scoresPayload,
        privateNotes,
      });

      if (res.success) {
        addNotification('Evaluation ballot submitted successfully!', 'success');
        localStorage.removeItem(`draft_notes_${selectedItem.submission._id}`);
        setShowConfirmModal(false);
        refetch();
      }
    } catch (err) {
      addNotification(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center rounded-2xl bg-rose-950/20 border border-rose-800 text-rose-300 text-sm">
        {error}
      </div>
    );
  }

  const submission = selectedItem?.submission;
  const currentTotal = computeTotalWeightedScore();

  return (
    <div className="space-y-6 py-6">
      <div className="pb-6 border-b border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-purple-400 uppercase tracking-wider mb-1">
            <Award className="w-4 h-4" />
            <span>Judge Evaluation Console</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white">Assigned Evaluation Queue</h1>
          <p className="text-sm text-gray-400 mt-1">
            Evaluate projects assigned to your track against the official weighted rubric.
          </p>
        </div>
        <div className="px-3.5 py-1.5 rounded-xl bg-surface border border-border-subtle text-xs font-mono text-gray-300">
          Total Queue: <span className="font-bold text-white">{queue.length}</span> Projects
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="p-16 text-center rounded-2xl bg-surface border border-border-subtle">
          <p className="text-gray-400 text-sm">No projects currently assigned to your queue.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-3 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono mb-2">
              Assigned Queue
            </h3>
            {queue.map((item) => {
              const isSelected = selectedItem?.assignmentId === item.assignmentId;
              const isDone = item.status === 'completed';

              return (
                <div
                  key={item.assignmentId}
                  onClick={() => setSelectedItem(item)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-surface-raised border-blue-500 shadow-glow'
                      : 'bg-surface border-border-subtle hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${getTrackBadgeColor(
                        item.track
                      )}`}
                    >
                      {item.track}
                    </span>
                    <span
                      className={`flex items-center space-x-1 text-xs font-mono font-semibold ${
                        isDone ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {isDone ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Scored</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          <span>Pending</span>
                        </>
                      )}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-white line-clamp-1">
                    {item.submission?.title || 'Untitled Project'}
                  </h4>
                </div>
              );
            })}
          </div>

          <div className="lg:col-span-9 bg-surface border border-border-subtle rounded-2xl p-6">
            {submission ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Briefing Panel */}
                <div className="space-y-6 lg:border-r lg:border-border-subtle lg:pr-8">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">{submission.title}</h2>
                    <p className="text-sm text-gray-400 mb-4">{submission.tagline}</p>

                    <div className="flex items-center space-x-3 mb-6">
                      {submission.githubUrl && (
                        <a
                          href={submission.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-surface-raised border border-border-subtle text-gray-300 hover:text-white text-xs font-semibold"
                        >
                          <Github className="w-4 h-4" />
                          <span>Repository</span>
                        </a>
                      )}
                      {submission.demoVideoUrl && (
                        <a
                          href={submission.demoVideoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-surface-raised border border-border-subtle text-gray-300 hover:text-white text-xs font-semibold"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>Demo</span>
                        </a>
                      )}
                    </div>

                    <div className="prose prose-invert prose-sm max-w-none text-gray-300">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(marked(submission.description || '')),
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Sticky Rubric Panel */}
                <div className="space-y-6 sticky top-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">
                      Rubric Scoring
                    </h3>
                    <div className="text-right">
                      <span className="text-xs text-gray-400 font-mono mr-2">Composite:</span>
                      <span className="text-xl font-bold font-mono text-emerald-400">
                        {currentTotal} / 10
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {rubric.map((criterion) => (
                      <RubricSlider
                        key={criterion.name}
                        criterion={criterion}
                        value={criteriaScores[criterion.name]}
                        onChange={handleSliderChange}
                      />
                    ))}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-gray-300">
                        Private Evaluator Notes
                      </label>
                      {saveStatus && (
                        <span className="text-[10px] font-mono text-blue-400 flex items-center space-x-1">
                          <Save className="w-3 h-3" />
                          <span>{saveStatus}</span>
                        </span>
                      )}
                    </div>
                    <textarea
                      rows={4}
                      value={privateNotes}
                      onChange={(e) => setPrivateNotes(e.target.value)}
                      placeholder="Enter confidential evaluation feedback or rationale..."
                      className="w-full p-3.5 rounded-xl bg-canvas border border-border-subtle text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>

                  <div className="pt-4 border-t border-border-subtle flex items-center justify-end">
                    <button
                      onClick={() => setShowConfirmModal(true)}
                      disabled={submitting || selectedItem?.status === 'completed'}
                      className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-glow flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      <span>{selectedItem?.status === 'completed' ? 'Ballot Recorded' : 'Submit Final Ballot'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">Select a project from the queue to score.</p>
            )}
          </div>
        </div>
      )}

      {showConfirmModal && (
        <Modal onClose={() => !submitting && setShowConfirmModal(false)}>
          <div className="p-2 space-y-4">
            <h2 className="text-xl font-bold text-white">Confirm Final Ballot</h2>
            <p className="text-sm text-gray-300">
              You are about to submit your final evaluation for{' '}
              <strong className="text-white">{submission?.title}</strong>. This action will compute the
              final weighted composite score and cannot be undone once submitted.
            </p>
            
            <div className="bg-canvas border border-border-subtle rounded-xl p-4 text-center space-y-1 my-4">
               <div className="text-xs text-gray-400 uppercase tracking-wider font-mono">Weighted Composite Score</div>
               <div className="text-4xl font-black font-mono text-emerald-400">{currentTotal}</div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-border-subtle">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-surface transition-colors"
              >
                Review Again
              </button>
              <button
                onClick={handleSubmitBallot}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center space-x-2 transition-colors disabled:opacity-50"
              >
                {submitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <span>{submitting ? 'Submitting...' : 'Confirm Submission'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
