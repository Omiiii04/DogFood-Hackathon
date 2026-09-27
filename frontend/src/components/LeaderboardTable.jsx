import React, { useState, useMemo } from 'react';
import { formatScore, getTrackBadgeColor } from '../utils/formatters';
import { Trophy, TrendingUp, BarChart2, ChevronUp, ChevronDown, Minus } from 'lucide-react';

export const LeaderboardTable = ({ data = [], onSelectProject }) => {
  const [useNormalized, setUseNormalized] = useState(true);

  // Compute raw ranks and normalized ranks to calculate shift
  const ranks = useMemo(() => {
    const rawRanks = {};
    const normRanks = {};

    const sortedByRaw = [...data].sort((a, b) => (b.rawMean || 0) - (a.rawMean || 0));
    sortedByRaw.forEach((proj, idx) => {
      rawRanks[proj.id] = idx + 1;
    });

    const sortedByNorm = [...data].sort((a, b) => (b.normalizedScore || 0) - (a.normalizedScore || 0));
    sortedByNorm.forEach((proj, idx) => {
      normRanks[proj.id] = idx + 1;
    });

    return { rawRanks, normRanks };
  }, [data]);

  const sortedData = [...data].sort((a, b) => {
    if (useNormalized) {
      const scoreA = a.normalizedScore != null ? a.normalizedScore : -1;
      const scoreB = b.normalizedScore != null ? b.normalizedScore : -1;
      return scoreB - scoreA;
    } else {
      return (b.rawMean || 0) - (a.rawMean || 0);
    }
  });

  return (
    <div className="bg-surface rounded-xl border border-border-subtle overflow-hidden">
      <div className="p-4 bg-surface-raised border-b border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-base text-white flex items-center space-x-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>Tournament Standings</span>
          </h3>
          <p className="text-xs text-gray-400">
            Real-time calibrated rankings calculated across all judge ballots.
          </p>
        </div>

        <div className="flex items-center bg-canvas p-1 rounded-lg border border-border-subtle">
          <button
            onClick={() => setUseNormalized(true)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              useNormalized
                ? 'bg-blue-600 text-white shadow-glow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Normalized (0-100)</span>
          </button>
          <button
            onClick={() => setUseNormalized(false)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              !useNormalized
                ? 'bg-blue-600 text-white shadow-glow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Raw Average (1-10)</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-canvas/50 text-[11px] font-mono uppercase text-gray-400 border-b border-border-subtle whitespace-nowrap">
            <tr>
              <th className="py-3 px-4">Rank</th>
              <th className="py-3 px-4">Project Title</th>
              <th className="py-3 px-4">Track</th>
              <th className="py-3 px-4">Team</th>
              <th className="py-3 px-4 text-center">Raw Mean</th>
              <th className="py-3 px-4 text-center">Norm Score</th>
              <th className="py-3 px-4 text-center">Z-Score</th>
              <th className="py-3 px-4 text-center">Ballots</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle font-normal">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan="8" className="py-8 text-center text-gray-500">
                  No scored projects currently available.
                </td>
              </tr>
            ) : (
              sortedData.map((project, index) => {
                const rank = index + 1;
                const rawRank = ranks.rawRanks[project.id];
                const normRank = ranks.normRanks[project.id];
                
                // Shift is calculated based on how normalization changed their rank
                // A positive shift means they moved UP (rank decreased)
                // We show this primarily when viewing normalized view, or vice versa
                const shift = rawRank - normRank;

                return (
                  <tr
                    key={project.id || index}
                    onClick={() => onSelectProject && onSelectProject(project)}
                    className="hover:bg-surface-raised/60 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs ${
                            rank === 1
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                              : rank === 2
                              ? 'bg-slate-300/20 text-slate-200 border border-slate-400/50'
                              : rank === 3
                              ? 'bg-amber-800/20 text-amber-500 border border-amber-800/50'
                              : 'text-gray-400 bg-canvas border border-border-subtle'
                          }`}
                        >
                          #{rank}
                        </span>
                        
                        {/* Rank Shift Badge */}
                        {useNormalized && project.normalizedScore != null && (
                          <div className="flex items-center justify-center w-5">
                            {shift > 0 ? (
                              <div className="flex items-center text-emerald-400 text-[10px]" title={`Moved up ${shift} spots`}>
                                <ChevronUp className="w-3 h-3" />
                                <span>{shift}</span>
                              </div>
                            ) : shift < 0 ? (
                              <div className="flex items-center text-rose-400 text-[10px]" title={`Moved down ${Math.abs(shift)} spots`}>
                                <ChevronDown className="w-3 h-3" />
                                <span>{Math.abs(shift)}</span>
                              </div>
                            ) : (
                              <Minus className="w-3 h-3 text-gray-600" title="No rank change" />
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white truncate max-w-[200px]" title={project.title}>
                        {project.title}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] border font-medium ${getTrackBadgeColor(
                          project.track
                        )}`}
                      >
                        {project.track}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-400 truncate max-w-[150px]" title={project.teamName}>
                      {project.teamName}
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      <span className="text-blue-400 font-bold">
                        {formatScore(project.rawMean, 2)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      {project.normalizedScore != null ? (
                        <span className="text-emerald-400 font-bold">
                          {formatScore(project.normalizedScore, 2)}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">--</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      {project.zScore != null ? (
                        <span className="text-purple-400 font-bold text-xs">
                          {project.zScore > 0 ? '+' : ''}{formatScore(project.zScore, 3)}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">--</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-xs text-gray-400">
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
