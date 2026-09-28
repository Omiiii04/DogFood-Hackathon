import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Trophy, Award, Star } from 'lucide-react';
import { getTrackBadgeColor } from '../utils/formatters';

const Confetti = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {[...Array(50)].map((_, i) => {
        const left = Math.random() * 100 + '%';
        const animDelay = Math.random() * 3 + 's';
        const animDuration = 3 + Math.random() * 4 + 's';
        const color = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][Math.floor(Math.random() * 5)];
        return (
          <div
            key={i}
            className="absolute top-[-5%] w-3 h-3 rounded-sm opacity-80 animate-confetti-fall"
            style={{
              left,
              backgroundColor: color,
              animationDelay: animDelay,
              animationDuration: animDuration,
            }}
          />
        );
      })}
    </div>
  );
};

export const ProjectorDisplay = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        let res = null;
        try {
          res = await api.get('/submissions/leaderboard');
        } catch (_) {
          res = await api.get('/admin/stats');
        }
        if (res && res.success) {
          const lb = res.data?.leaderboard || res.data?.standings || [];
          setLeaderboard(lb);
        }
      } catch (err) {
        console.error('Failed to load leaderboard', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const top3 = leaderboard.slice(0, 3);
  const runnersUp = leaderboard.slice(3, 10);

  // Group by track to find category winners (highest score per track)
  const categoryWinnersMap = {};
  leaderboard.forEach(entry => {
    if (!categoryWinnersMap[entry.track] && entry.compositeScore > 0) {
      categoryWinnersMap[entry.track] = entry;
    }
  });
  const categoryWinners = Object.values(categoryWinnersMap);

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden flex flex-col z-[100] font-sans selection:bg-transparent">
      <Confetti />
      
      {/* Header */}
      <header className="p-8 flex items-center justify-between border-b border-gray-900 bg-gray-950/80 backdrop-blur-md">
        <div className="flex items-center space-x-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-[0_0_40px_rgba(59,130,246,0.6)]">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight uppercase text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
              DogFood Hackathon 2026
            </h1>
            <p className="text-xl text-gray-400 font-medium tracking-widest uppercase mt-1">
              Final Standings & Awards
            </p>
          </div>
        </div>
      </header>

      {/* Main Content - Podium */}
      <main className="flex-1 flex flex-col items-center justify-end pb-24 bg-gradient-to-b from-black to-blue-950/20 relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.1)_0%,transparent_60%)]"></div>
        
        <div className="flex items-end justify-center space-x-6 lg:space-x-12 z-10 w-full max-w-6xl px-8 h-[60vh]">
          {/* 2nd Place */}
          {top3[1] && (
            <div className="flex flex-col items-center w-1/3 animate-podium-up" style={{ animationDelay: '0.5s' }}>
              <div className="text-center mb-6 max-w-[90%]">
                <span className={`inline-block px-3 py-1 text-xs font-bold rounded-lg border mb-3 ${getTrackBadgeColor(top3[1].track)}`}>
                  {top3[1].track}
                </span>
                <h3 className="text-3xl font-bold truncate px-2 text-gray-200">{top3[1].projectTitle}</h3>
                <p className="text-lg text-gray-400 mt-2 font-mono">Score: {top3[1].compositeScore.toFixed(2)}</p>
              </div>
              <div className="w-full h-48 bg-gradient-to-t from-gray-800 to-gray-700 rounded-t-3xl border-t border-gray-600 flex justify-center pt-6 shadow-[0_0_30px_rgba(156,163,175,0.2)]">
                <span className="text-5xl font-black text-gray-400">2</span>
              </div>
            </div>
          )}

          {/* 1st Place */}
          {top3[0] && (
            <div className="flex flex-col items-center w-1/3 animate-podium-up z-20" style={{ animationDelay: '1s' }}>
              <div className="text-center mb-8 max-w-[95%]">
                <div className="mb-4 flex justify-center">
                  <Award className="w-16 h-16 text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
                </div>
                <span className={`inline-block px-3 py-1 text-sm font-bold rounded-lg border mb-3 ${getTrackBadgeColor(top3[0].track)}`}>
                  {top3[0].track}
                </span>
                <h3 className="text-5xl font-black truncate px-2 text-yellow-400 drop-shadow-md">{top3[0].projectTitle}</h3>
                <p className="text-2xl text-yellow-200/70 mt-3 font-mono font-bold">Score: {top3[0].compositeScore.toFixed(2)}</p>
                <p className="text-lg text-gray-300 mt-1 uppercase tracking-widest">{top3[0].teamName}</p>
              </div>
              <div className="w-full h-64 bg-gradient-to-t from-yellow-900 to-yellow-700 rounded-t-3xl border-t-2 border-yellow-500 flex justify-center pt-8 shadow-[0_0_50px_rgba(234,179,8,0.3)]">
                <span className="text-7xl font-black text-yellow-300 drop-shadow-lg">1</span>
              </div>
            </div>
          )}

          {/* 3rd Place */}
          {top3[2] && (
            <div className="flex flex-col items-center w-1/3 animate-podium-up" style={{ animationDelay: '0.2s' }}>
              <div className="text-center mb-6 max-w-[90%]">
                <span className={`inline-block px-3 py-1 text-xs font-bold rounded-lg border mb-3 ${getTrackBadgeColor(top3[2].track)}`}>
                  {top3[2].track}
                </span>
                <h3 className="text-2xl font-bold truncate px-2 text-amber-600">{top3[2].projectTitle}</h3>
                <p className="text-lg text-gray-500 mt-2 font-mono">Score: {top3[2].compositeScore.toFixed(2)}</p>
              </div>
              <div className="w-full h-36 bg-gradient-to-t from-amber-950 to-amber-900 rounded-t-3xl border-t border-amber-800 flex justify-center pt-5 shadow-[0_0_20px_rgba(180,83,9,0.2)]">
                <span className="text-4xl font-black text-amber-700">3</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Category Ticker */}
      <footer className="bg-gray-950 border-t border-gray-900 py-5 overflow-hidden flex items-center">
        <div className="px-6 flex shrink-0 items-center space-x-2 bg-gray-950 z-10">
          <Star className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-gray-300 uppercase tracking-widest text-sm">Category Winners</span>
          <div className="w-px h-6 bg-gray-800 ml-4"></div>
        </div>
        <div className="flex-1 overflow-hidden relative h-8 flex items-center">
          <div className="absolute whitespace-nowrap animate-ticker flex space-x-16 items-center">
            {[...categoryWinners, ...categoryWinners].map((winner, idx) => (
              <div key={idx} className="flex items-center space-x-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getTrackBadgeColor(winner.track)}`}>
                  {winner.track}
                </span>
                <span className="font-bold text-white text-lg">{winner.projectTitle}</span>
                <span className="text-gray-500 text-sm font-mono">{winner.compositeScore.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};
