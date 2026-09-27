import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import api from '../services/api';
import { useNotification } from '../context/NotificationContext';

export const UpvoteWidget = ({ submission, size = 'sm' }) => {
  const [votes, setVotes] = useState(submission.publicVoteCount || 0);
  const [isVoting, setIsVoting] = useState(false);
  const { addNotification } = useNotification();

  const handleVote = async (e) => {
    e.stopPropagation();
    if (isVoting) return;

    setIsVoting(true);
    setVotes((prev) => prev + 1);

    try {
      const res = await api.post('/votes', { submissionId: submission._id || submission.id });
      if (res.success) {
        setVotes(res.data.newVoteCount);
      }
    } catch (err) {
      setVotes((prev) => prev - 1);
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
      className={`flex items-center space-x-1.5 rounded-lg bg-surface-raised border border-border-subtle text-gray-300 hover:text-rose-400 hover:border-rose-800/60 active:scale-95 transition-all ${isLg ? 'px-4 py-2 shadow-glow' : 'px-3 py-1.5'
        }`}
    >
      <Heart className={`${isLg ? 'w-4 h-4' : 'w-3.5 h-3.5'} ${votes > 0 ? 'text-rose-500 fill-rose-500' : ''}`} />
      <span className={`font-mono font-bold ${isLg ? 'text-sm' : 'text-xs'}`}>{votes}</span>
    </button>
  );
};
