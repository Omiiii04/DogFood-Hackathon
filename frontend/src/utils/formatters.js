export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatScore = (score, digits = 2) => {
  if (score === null || score === undefined) return '—';
  return Number(score).toFixed(digits);
};

export const getTrackBadgeColor = (track) => {
  switch (track) {
    case 'AI/ML':
      return 'bg-violet-100 text-violet-700 border-violet-200';
    case 'Web3 & Blockchain':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'FinTech':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'HealthTech':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    default:
      return 'bg-blue-100 text-blue-700 border-blue-200';
  }
};
