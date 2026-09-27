import React, { useState, useEffect } from 'react';
import { useJudging } from '../hooks/useJudging';
import { RubricSlider } from '../components/RubricSlider';
import { useNotification } from '../context/NotificationContext';
import api from '../services/api';
import { Award, CheckCircle, Clock, Send, Github, ExternalLink } from 'lucide-react';
import { getTrackBadgeColor } from '../utils/formatters';

export const JudgePortal = () => {
  const { queue, rubric, loading, error, refetch } = useJudging();
  const { addNotification } = useNotification();

  const [selectedItem, setSelectedItem] = useState(null);
  const [criteriaScores, setCriteriaScores] = useState({});
  const [privateNotes, setPrivateNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
        setPrivateNotes('');
      }
    }
  }, [selectedItem, rubric]);

  useEffect(() => {
    if (queue.length > 0 && !selectedItem) {
      setSelectedItem(queue[0]);
    }
  }, [queue, selectedItem]);

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
          <div className="lg:col-span-4 space-y-3">
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
                  <p className="text-xs text-gray-400 line-clamp-1 mt-1">
                    {item.submission?.tagline || 'No tagline'}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="lg:col-span-8 bg-surface border border-border-subtle rounded-2xl p-6 sm:p-8 space-y-6">
            {submission ? (
              <>
                <div className="border-b border-border-subtle pb-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white">{submission.title}</h2>
                      <p className="text-sm text-gray-400 mt-1">{submission.tagline}</p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {submission.githubUrl && (
                        <a
                          href={submission.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-lg bg-surface-raised border border-border-subtle text-gray-300 hover:text-white"
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
                          className="p-2 rounded-lg bg-surface-raised border border-border-subtle text-gray-300 hover:text-white"
                          title="View Demo"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">
                      Rubric Scoring (Scale 1.0 – 10.0)
                    </h3>
                    <div className="text-right">
                      <span className="text-xs text-gray-400 font-mono mr-2">Total Score:</span>
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
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Private Evaluator Notes (Confidential to Judges & Organizers)
                  </label>
                  <textarea
                    rows={3}
                    value={privateNotes}
                    onChange={(e) => setPrivateNotes(e.target.value)}
                    placeholder="Enter confidential evaluation feedback or rationale..."
                    className="w-full p-3.5 rounded-xl bg-canvas border border-border-subtle text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                <div className="pt-4 border-t border-border-subtle flex items-center justify-end">
                  <button
                    onClick={handleSubmitBallot}
                    disabled={submitting}
                    className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-glow flex items-center space-x-2 transition-all disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>{submitting ? 'Recording Ballot...' : 'Submit Evaluation Ballot'}</span>
                  </button>
                </div>
              </>
            ) : (
              <p className="text-gray-400 text-sm">Select a project from the queue to score.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
