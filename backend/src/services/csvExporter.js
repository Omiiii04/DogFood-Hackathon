function generateStandingsCSV(standings) {
  const headers = [
    'Rank',
    'Project Title',
    'Team Name',
    'Track',
    'Normalized Score (0-100)',
    'Raw Mean Score (1-10)',
    'Z-Score Mean',
    'Ballot Count',
    'Public Votes',
    'Repo URL',
  ];

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = standings.map((item) => {
    return [
      escapeCSV(item.rank),
      escapeCSV(item.title),
      escapeCSV(item.teamName),
      escapeCSV(item.track),
      escapeCSV(item.normalizedScore != null ? item.normalizedScore.toFixed(2) : 'N/A'),
      escapeCSV(item.rawMean != null ? item.rawMean.toFixed(2) : 'N/A'),
      escapeCSV(item.zScoreMean != null ? item.zScoreMean.toFixed(4) : 'N/A'),
      escapeCSV(item.ballotCount || 0),
      escapeCSV(item.publicVoteCount || 0),
      escapeCSV(item.repoUrl || ''),
    ].join(',');
  });

  return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
}

module.exports = {
  generateStandingsCSV,
};
