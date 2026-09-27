import React, { useEffect } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { getTrackBadgeColor } from '../utils/formatters';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import api from '../services/api';
import { useNotification } from '../context/NotificationContext';

export const PairwiseJudging = ({ queue, rubric, refetch }) => {
  const { addNotification } = useNotification();
  
  // Get the first two pending assignments
  const pendingQueue = queue.filter(item => item.status !== 'completed');
  const projectA = pendingQueue.length > 0 ? pendingQueue[0] : null;
  const projectB = pendingQueue.length > 1 ? pendingQueue[1] : null;

  const handleVote = async (winner, loser) => {
    if (!winner || !loser) return;

    // We simulate a pairwise result by submitting a high score for winner and lower for loser
    // using the existing rubric.
    const winnerScores = rubric.map(crit => ({
      criteriaName: crit.name,
      weight: crit.weight,
      rawScore: 9.0
    }));

    const loserScores = rubric.map(crit => ({
      criteriaName: crit.name,
      weight: crit.weight,
      rawScore: 5.0
    }));

    try {
      // Submit winner
      await api.post('/judging/scores', {
        submissionId: winner.submission._id,
        criteriaScores: winnerScores,
        privateNotes: 'Pairwise Winner'
      });
      // Submit loser
      await api.post('/judging/scores', {
        submissionId: loser.submission._id,
        criteriaScores: loserScores,
        privateNotes: 'Pairwise Loser'
      });

      addNotification('Pairwise comparison recorded!', 'success');
      refetch();
    } catch (err) {
      addNotification('Failed to record pairwise vote: ' + err.message, 'error');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!projectA || !projectB) return;
      if (e.key === 'ArrowLeft') {
        handleVote(projectA, projectB);
      } else if (e.key === 'ArrowRight') {
        handleVote(projectB, projectA);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [projectA, projectB]);

  if (!projectA || !projectB) {
    return (
      <div className="p-16 text-center rounded-2xl bg-surface border border-border-subtle">
        <p className="text-gray-400 text-sm">
          Not enough pending projects for pairwise comparison. Need at least 2.
        </p>
      </div>
    );
  }

  const renderProject = (item, isLeft) => {
    const sub = item.submission;
    return (
      <div className="flex-1 bg-surface border border-border-subtle rounded-2xl p-6 flex flex-col h-[70vh] overflow-y-auto">
        <div className="mb-4">
          <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${getTrackBadgeColor(item.track)}`}>
            {item.track}
          </span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{sub.title}</h2>
        <p className="text-sm text-gray-400 mb-6">{sub.tagline}</p>
        
        <div className="prose prose-invert prose-sm max-w-none text-gray-300 flex-1">
          <div
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(marked(sub.description || '')),
            }}
          />
        </div>

        <div className="pt-6 mt-6 border-t border-border-subtle">
          <button
            onClick={() => handleVote(isLeft ? projectA : projectB, isLeft ? projectB : projectA)}
            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all shadow-glow ${
              isLeft ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {isLeft && <ArrowLeft className="w-5 h-5" />}
            <span>Vote for {isLeft ? 'Left' : 'Right'}</span>
            {!isLeft && <ArrowRight className="w-5 h-5" />}
          </button>
          <p className="text-center text-xs text-gray-500 mt-3 font-mono">
            Press <strong>{isLeft ? 'Left Arrow' : 'Right Arrow'}</strong>
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-gray-400 font-mono mb-2">
        <span>Press Left/Right arrow keys for rapid evaluation.</span>
      </div>
      <div className="flex flex-col lg:flex-row gap-6 items-stretch">
        {renderProject(projectA, true)}
        <div className="hidden lg:flex items-center justify-center -mx-3 z-10">
          <div className="w-12 h-12 bg-canvas border-2 border-border-subtle rounded-full flex items-center justify-center font-bold text-gray-400">
            VS
          </div>
        </div>
        {renderProject(projectB, false)}
      </div>
    </div>
  );
};
