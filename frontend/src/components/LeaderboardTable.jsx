import React, { useState, useMemo } from 'react';
import { formatScore, getTrackBadgeColor } from '../utils/formatters';
import { Trophy, TrendingUp, BarChart2, ChevronUp, ChevronDown, Minus } from 'lucide-react';

export const LeaderboardTable = ({ data = [], onSelectProject }) => {
  const [useNormalized, setUseNormalized] = useState(true);

  const ranks = useMemo(() => {
    const rawRanks  = {};
    const normRanks = {};
    [...data].sort((a, b) => (b.rawMean || 0) - (a.rawMean || 0)).forEach((proj, idx) => {
      const pid = proj.id || proj._id;
      if (pid) rawRanks[pid] = idx + 1;
    });
    [...data].sort((a, b) => (b.normalizedScore || 0) - (a.normalizedScore || 0)).forEach((proj, idx) => {
      const pid = proj.id || proj._id;
      if (pid) normRanks[pid] = idx + 1;
    });
    return { rawRanks, normRanks };
  }, [data]);

  const sortedData = [...data].sort((a, b) => {
    if (useNormalized) {
      const scoreA = a.normalizedScore != null ? a.normalizedScore : -1;
      const scoreB = b.normalizedScore != null ? b.normalizedScore : -1;
      return scoreB - scoreA;
    }
    return (b.rawMean || 0) - (a.rawMean || 0);
  });

  const medalClass = (rank) => {
    if (rank === 1) return 'bg-[#FFD700]/15 border-[#FFD700]/50 text-[#B8860B]';
    if (rank === 2) return 'bg-[#C0C0C0]/15 border-[#C0C0C0]/50 text-[#707070]';
    if (rank === 3) return 'bg-[#CD7F32]/15 border-[#CD7F32]/50 text-[#8B4513]';
    return 'bg-surface-container border-outline-variant/60 text-on-surface-variant';
  };

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-surface-container-low border-b border-surface-container flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-title-md text-title-md text-on-surface font-bold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-status-warning" />
            Tournament Standings
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Real-time calibrated rankings across all judge ballots.
          </p>
        </div>

        <div className="flex items-center bg-surface-container p-1 rounded-xl border border-outline-variant/40 gap-0.5">
          {[
            { id: true,  label: 'Normalized (0–100)', Icon: TrendingUp },
            { id: false, label: 'Raw Avg (1–10)',      Icon: BarChart2  },
          ].map(({ id, label, Icon }) => (
            <button
              key={String(id)}
              onClick={() => setUseNormalized(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-label-caps text-label-caps font-bold transition-all ${
                useNormalized === id
                  ? 'bg-primary-container text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-container/50 border-b border-surface-container">
            <tr className="font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider whitespace-nowrap">
              <th className="py-3 px-4">Rank</th>
              <th className="py-3 px-4">Project</th>
              <th className="py-3 px-4">Track</th>
              <th className="py-3 px-4">Team</th>
              <th className="py-3 px-4 text-center">Raw Mean</th>
              <th className="py-3 px-4 text-center">Norm Score</th>
              <th className="py-3 px-4 text-center">Z-Score</th>
              <th className="py-3 px-4 text-center">Ballots</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan="8" className="py-12 text-center font-body-md text-body-md text-on-surface-variant">
                  No scored projects available yet.
                </td>
              </tr>
            ) : (
              sortedData.map((project, index) => {
                const rank    = index + 1;
                const projId  = project.id || project._id;
                const shift   = (ranks.rawRanks[projId] != null && ranks.normRanks[projId] != null)
                  ? ranks.rawRanks[projId] - ranks.normRanks[projId]
                  : 0;
                return (
                  <tr
                    key={project.id || index}
                    onClick={() => onSelectProject && onSelectProject(project)}
                    className="hover:bg-surface-container-low transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-label-caps text-label-caps font-bold border ${medalClass(rank)}`}>
                          #{rank}
                        </span>
                        {useNormalized && project.normalizedScore != null && (
                          <div className="flex items-center justify-center w-5">
                            {shift > 0 ? (
                              <div className="flex items-center text-status-success font-label-caps text-[10px]" title={`Up ${shift}`}>
                                <ChevronUp className="w-3 h-3" /><span>{shift}</span>
                              </div>
                            ) : shift < 0 ? (
                              <div className="flex items-center text-error font-label-caps text-[10px]" title={`Down ${Math.abs(shift)}`}>
                                <ChevronDown className="w-3 h-3" /><span>{Math.abs(shift)}</span>
                              </div>
                            ) : (
                              <Minus className="w-3 h-3 text-outline" />
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-title-md text-title-md text-on-surface font-semibold truncate max-w-[200px] group-hover:text-primary transition-colors" title={project.title}>
                        {project.title}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full font-label-caps text-label-caps border ${getTrackBadgeColor(project.track)}`}>
                        {project.track}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-body-sm text-body-sm text-on-surface-variant truncate max-w-[150px]" title={project.teamName}>
                      {project.teamName}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-primary">
                      {formatScore(project.rawMean, 2)}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-status-success">
                      {project.normalizedScore != null ? formatScore(project.normalizedScore, 2) : <span className="text-outline font-normal">—</span>}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-secondary">
                      {project.zScore != null
                        ? <>{project.zScore > 0 ? '+' : ''}{formatScore(project.zScore, 3)}</>
                        : <span className="text-outline font-normal">—</span>}
                    </td>
                    <td className="py-3 px-4 text-center font-body-sm text-body-sm text-on-surface-variant">
                      {project.ballotCount || 0}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
