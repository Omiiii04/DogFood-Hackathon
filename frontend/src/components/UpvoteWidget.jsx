import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import api from '../services/api';
import { useNotification } from '../context/NotificationContext';

export const UpvoteWidget = ({ submission, size = 'sm' }) => {
  const [votes, setVotes] = useState(submission.publicVoteCount || 0);
  const [voted, setVoted] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const { addNotification } = useNotification();

  const handleVote = async (e) => {
    e.stopPropagation();
    if (isVoting) return;

    setIsVoting(true);
    setVoted(true);
    setVotes((prev) => prev + 1);

    try {
      const res = await api.post('/votes', { submissionId: submission._id || submission.id });
      if (res.success) {
        setVotes(res.data.newVoteCount);
      }
    } catch (err) {
      setVotes((prev) => prev - 1);
      setVoted(false);
      addNotification(err.message, 'error');
    } finally {
      setIsVoting(false);
    }
  };

  const isLg = size === 'lg';

  return (
    <button
      onClick={handleVote}
      disabled={isVoting}
      className={`flex items-center gap-1.5 rounded-lg transition-all active:scale-90 disabled:opacity-60
        ${isLg
          ? 'px-4 py-2 bg-[#1a1f2e] border border-[#2a3550] hover:border-rose-800/60 hover:bg-rose-950/20 shadow-md'
          : 'px-3 py-1.5 bg-[#141927] border border-[#1e2d4a] hover:border-rose-700/50 hover:bg-rose-950/20'
        }
        ${voted ? 'border-rose-700/60' : ''}
      `}
    >
      <Heart
        className={`${isLg ? 'w-4 h-4' : 'w-3.5 h-3.5'} transition-colors ${
          voted || votes > 0 ? 'text-rose-500 fill-rose-500' : 'text-slate-400'
        }`}
      />
      <span className={`font-mono font-bold ${isLg ? 'text-sm text-white' : 'text-xs text-slate-300'}`}>
        {votes}
      </span>
    </button>
  );
};

