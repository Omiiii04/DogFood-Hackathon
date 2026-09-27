import React, { useState } from 'react';
import { formatScore, getTrackBadgeColor } from '../utils/formatters';
import { Trophy, TrendingUp, BarChart2 } from 'lucide-react';

export const LeaderboardTable = ({ data = [], onSelectProject }) => {
  const [useNormalized, setUseNormalized] = useState(true);

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
          <thead className="bg-canvas/50 text-xs font-mono uppercase text-gray-400 border-b border-border-subtle">
            <tr>
              <th className="py-3 px-4">Rank</th>
              <th className="py-3 px-4">Project & Team</th>
              <th className="py-3 px-4">Track</th>
              <th className="py-3 px-4 text-center">Ballots</th>
              <th className="py-3 px-4 text-right">
                {useNormalized ? 'Normalized Score' : 'Raw Mean'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle font-normal">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-8 text-center text-gray-500">
                  No scored projects currently available.
                </td>
              </tr>
            ) : (
              sortedData.map((project, index) => {
                const rank = index + 1;
                const isPodium = rank <= 3;

                return (
                  <tr
                    key={project.id || index}
                    onClick={() => onSelectProject && onSelectProject(project)}
                    className="hover:bg-surface-raised/60 transition-colors cursor-pointer"
                  >
                    <td className="py-4 px-4 font-mono font-bold">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs ${
                          rank === 1
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                            : rank === 2
                            ? 'bg-slate-300/20 text-slate-200 border border-slate-400/50'
                            : rank === 3
                            ? 'bg-amber-800/20 text-amber-500 border border-amber-800/50'
                            : 'text-gray-400'
                        }`}
                      >
                        #{rank}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-semibold text-white">{project.title}</div>
                      <div className="text-xs text-gray-400">{project.teamName}</div>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs border font-medium ${getTrackBadgeColor(
                          project.track
                        )}`}
                      >
                        {project.track}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center font-mono text-xs text-gray-400">
                      {project.ballotCount || 0}
                    </td>
                    <td className="py-4 px-4 text-right font-mono">
                      {useNormalized ? (
                        project.normalizedScore != null ? (
                          <span className="text-emerald-400 font-bold text-base">
                            {formatScore(project.normalizedScore, 2)}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-xs">Unnormalized</span>
                        )
                      ) : (
                        <span className="text-blue-400 font-bold text-base">
                          {formatScore(project.rawMean, 2)} / 10
                        </span>
                      )}
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
