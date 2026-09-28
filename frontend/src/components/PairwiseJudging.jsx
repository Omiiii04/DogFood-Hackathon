import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Github, ExternalLink } from 'lucide-react';
import { getTrackBadgeColor } from '../utils/formatters';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import api from '../services/api';
import { useNotification } from '../context/NotificationContext';

export const PairwiseJudging = ({ queue, rubric, refetch }) => {
  const { addNotification } = useNotification();

  // Use ALL queue items for pairwise (not just pending) so that already-scored
  // items can still be compared head-to-head.
  const allItems = queue.filter((item) => item.submission);

  // Track which pairs have been voted on this session (by sorted pair key)
  const [votedPairs, setVotedPairs] = useState(new Set());
  // Current pair index into the list of all un-voted pairs
  const [pairIndex, setPairIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Build all unique pairs from allItems
  const allPairs = [];
  for (let i = 0; i < allItems.length; i++) {
    for (let j = i + 1; j < allItems.length; j++) {
      const key = [allItems[i].submission._id, allItems[j].submission._id].sort().join('|');
      allPairs.push({ a: allItems[i], b: allItems[j], key });
    }
  }

  // Pairs not yet voted on this session
  const pendingPairs = allPairs.filter((p) => !votedPairs.has(p.key));

  // If we've gone through all pairs, cycle back
  const currentPair = pendingPairs.length > 0 ? pendingPairs[pairIndex % pendingPairs.length] : null;

  const projectA = currentPair?.a || null;
  const projectB = currentPair?.b || null;

  const handleVote = useCallback(async (winner, loser) => {
    if (!winner || !loser || submitting) return;

    setSubmitting(true);
    const winnerScores = rubric.map((crit) => ({ criteriaName: crit.name, weight: crit.weight, rawScore: 8.0 }));
    const loserScores  = rubric.map((crit) => ({ criteriaName: crit.name, weight: crit.weight, rawScore: 4.0 }));

    try {
      await Promise.all([
        api.post('/judging/scores', {
          submissionId: winner.submission._id,
          criteriaScores: winnerScores,
          privateNotes: `Pairwise Winner over "${loser.submission?.title || 'opponent'}"`,
        }),
        api.post('/judging/scores', {
          submissionId: loser.submission._id,
          criteriaScores: loserScores,
          privateNotes: `Pairwise Loser against "${winner.submission?.title || 'opponent'}"`,
        }),
      ]);

      // Record the pairwise comparison
      await api.post('/judging/pairwise', {
        submissionA: winner.submission._id,
        submissionB: loser.submission._id,
        winner: winner.submission._id,
        notes: `Pairwise: "${winner.submission?.title}" over "${loser.submission?.title}"`,
      }).catch(() => {});

      // Mark this pair as voted
      const pairKey = [winner.submission._id, loser.submission._id].sort().join('|');
      setVotedPairs((prev) => new Set([...prev, pairKey]));
      setPairIndex((prev) => prev + 1);

      addNotification(`✓ "${winner.submission?.title}" wins this round!`, 'success');
      refetch();
    } catch (err) {
      addNotification('Failed to record pairwise vote: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [rubric, submitting, addNotification, refetch]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!projectA || !projectB || submitting) return;
      if (e.key === 'ArrowLeft')  handleVote(projectA, projectB);
      if (e.key === 'ArrowRight') handleVote(projectB, projectA);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [projectA, projectB, handleVote, submitting]);

  if (allItems.length < 2) {
    return (
      <div className="p-16 text-center rounded-2xl bg-surface-container-low border border-surface-container">
        <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-3 block">compare</span>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Not enough projects for pairwise comparison. At least 2 projects are needed.
        </p>
      </div>
    );
  }

  if (!currentPair) {
    // All pairs have been voted — show completion state with option to reset
    return (
      <div className="p-16 text-center rounded-2xl bg-surface-container-low border border-surface-container space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-status-success/10 border border-status-success/20 flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-[30px] text-status-success">done_all</span>
        </div>
        <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">All Pairs Compared!</h3>
        <p className="font-body-md text-body-md text-on-surface-variant">
          You've completed all {allPairs.length} pairwise comparisons. You can run another round to refine rankings.
        </p>
        <button
          onClick={() => { setVotedPairs(new Set()); setPairIndex(0); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.22)] hover:bg-primary active:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          Start New Round
        </button>
      </div>
    );
  }

  const votedCount = votedPairs.size;
  const totalPairs = allPairs.length;

  const renderProject = (item, isLeft) => {
    const sub = item.submission;
    const btnColor = isLeft
      ? 'bg-secondary-container text-on-primary hover:bg-secondary shadow-[0_4px_14px_rgba(70,72,212,0.25)]'
      : 'bg-primary-container text-on-primary hover:bg-primary shadow-[0_4px_14px_rgba(30,96,255,0.25)]';

    return (
      <div className="flex-1 bg-surface-container-lowest border border-surface-container rounded-2xl p-6 flex flex-col max-h-[72vh] overflow-y-auto shadow-sm hover:shadow-md transition-shadow">
        {/* Track badge */}
        <div className="mb-4">
          <span className={`px-2.5 py-0.5 rounded-full font-label-caps text-label-caps border ${getTrackBadgeColor(item.track)}`}>
            {item.track}
          </span>
        </div>

        <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-1">{sub.title}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-4">{sub.tagline}</p>

        {/* Links */}
        <div className="flex items-center gap-2 mb-4">
          {(sub.githubUrl || sub.repoUrl) && (
            <a
              href={sub.githubUrl || sub.repoUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-low border border-outline-variant/60 text-on-surface-variant hover:text-on-surface font-label-caps text-label-caps font-semibold transition-all hover:border-outline text-xs"
            >
              <Github className="w-3 h-3" /><span>GitHub</span>
            </a>
          )}
          {(sub.demoVideoUrl || sub.demoUrl) && (
            <a
              href={sub.demoVideoUrl || sub.demoUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-low border border-outline-variant/60 text-on-surface-variant hover:text-on-surface font-label-caps text-label-caps font-semibold transition-all hover:border-outline text-xs"
            >
              <ExternalLink className="w-3 h-3" /><span>Demo</span>
            </a>
          )}
        </div>

        <div className="prose-stitch text-sm flex-1 max-w-none">
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked(sub.description || '')) }} />
        </div>

        <div className="pt-5 mt-5 border-t border-surface-container">
          <button
            onClick={() => handleVote(isLeft ? projectA : projectB, isLeft ? projectB : projectA)}
            disabled={submitting}
            className={`w-full py-3.5 rounded-xl font-title-md text-title-md font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60 ${btnColor}`}
          >
            {isLeft && <ArrowLeft className="w-5 h-5" />}
            <span>{submitting ? 'Recording…' : `Vote for ${isLeft ? 'Left' : 'Right'}`}</span>
            {!isLeft && <ArrowRight className="w-5 h-5" />}
          </button>
          <p className="text-center font-label-caps text-label-caps text-on-surface-variant mt-2.5">
            Press <strong>{isLeft ? '← Left Arrow' : 'Right Arrow →'}</strong> to vote
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/50 font-body-sm text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[15px] text-primary">keyboard</span>
          <span>Press <strong>← →</strong> arrow keys for rapid keyboard evaluation</span>
        </div>
        <div className="ml-auto flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/50 font-label-caps text-label-caps text-on-surface-variant">
          <span className="text-primary font-bold">{votedCount}</span>
          <span>/ {totalPairs} pairs</span>
        </div>
      </div>

      {/* Progress bar track */}
      <div className="w-full h-1.5 rounded-full bg-surface-container">
        <div
          className="h-1.5 rounded-full bg-primary transition-all duration-500"
          style={{ width: `${totalPairs > 0 ? (votedCount / totalPairs) * 100 : 0}%` }}
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-stretch">
        {renderProject(projectA, true)}
        <div className="hidden lg:flex items-center justify-center -mx-2 z-10">
          <div className="w-10 h-10 bg-surface-container-lowest border-2 border-outline-variant/60 rounded-full flex items-center justify-center font-label-caps text-label-caps font-extrabold text-on-surface-variant shadow-sm">
            VS
          </div>
        </div>
        {renderProject(projectB, false)}
      </div>
    </div>
  );
};
