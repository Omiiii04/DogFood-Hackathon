import React, { useState, useEffect } from 'react';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { ScoreDistributionChart } from '../components/ScoreDistributionChart';
import { JudgeVarianceChart } from '../components/JudgeVarianceChart';
import { AuditLogViewer } from '../components/AuditLogViewer';
import { RubricDesigner } from '../components/RubricDesigner';
import { useNotification } from '../context/NotificationContext';
import api from '../services/api';
import {
  Shield,
  Users,
  Cpu,
  Download,
  History,
  Search,
  Filter
} from 'lucide-react';

export const AdminDashboard = () => {
  const { addNotification } = useNotification();

  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [assigning, setAssigning] = useState(false);
  const [normalizing, setNormalizing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState('All Tracks');

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [statsRes, lbRes, logsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/leaderboard'),
        api.get('/admin/audit-logs'),
      ]);

      if (statsRes.success) setStats(statsRes.data);
      if (lbRes.success) setLeaderboard(lbRes.data.leaderboard);
      if (logsRes.success) setAuditLogs(logsRes.data.logs);
    } catch (err) {
      addNotification(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleAssignJudges = async () => {
    if (!window.confirm('Execute automated greedy judge assignment across all submitted projects?')) {
      return;
    }
    setAssigning(true);
    try {
      const res = await api.post('/admin/assign-judges', { targetPerProject: 3 });
      if (res.success) {
        addNotification(`Successfully created ${res.data.totalAssigned} judge assignments!`, 'success');
        fetchAdminData();
      }
    } catch (err) {
      addNotification(err.message, 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleRunNormalization = async () => {
    setNormalizing(true);
    try {
      const res = await api.post('/admin/normalize-scores');
      if (res.success) {
        addNotification(
          `Normalized ${res.data.total_scores_processed} scores across ${res.data.total_submissions || 'projects'}!`,
          'success'
        );
        fetchAdminData();
      }
    } catch (err) {
      addNotification(err.message, 'error');
    } finally {
      setNormalizing(false);
    }
  };

  const handleExportCSV = () => {
    window.open('/api/v1/admin/export/csv', '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const filteredLeaderboard = leaderboard.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.teamName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTrack = trackFilter === 'All Tracks' || item.track === trackFilter;
    return matchesSearch && matchesTrack;
  });

  const uniqueTracks = ['All Tracks', ...new Set(leaderboard.map(item => item.track).filter(Boolean))];

  const lastRunLog = auditLogs.find(l => l.action === 'NORMALIZATION_EXECUTED');
  const lastRunTime = lastRunLog ? new Date(lastRunLog.timestamp).toLocaleString() : 'Never';

  const ballotPercent = stats && stats.totalAssignments > 0 
    ? ((stats.totalScores / stats.totalAssignments) * 100).toFixed(1) 
    : 0;

  return (
    <div className="space-y-8 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border-subtle gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-blue-400 uppercase tracking-wider mb-1">
            <Shield className="w-4 h-4" />
            <span>Tournament Administration</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white">Organizer Command Center</h1>
          <p className="text-sm text-gray-400 mt-1">
            Orchestrate judge assignments, execute statistical normalization, and export results.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleAssignJudges}
            disabled={assigning}
            className="px-4 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border-subtle text-white font-semibold text-xs flex items-center space-x-2 transition-all disabled:opacity-50"
          >
            <Users className="w-4 h-4 text-purple-400" />
            <span>{assigning ? 'Assigning...' : 'Auto-Assign Judges'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-glow flex items-center space-x-2 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="p-4 rounded-xl bg-surface border border-border-subtle">
            <div className="text-xs text-gray-400 font-medium">Participants</div>
            <div className="text-2xl font-bold font-mono text-white mt-1">{stats.totalUsers}</div>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border-subtle">
            <div className="text-xs text-gray-400 font-medium">Teams</div>
            <div className="text-2xl font-bold font-mono text-blue-400 mt-1">{stats.totalTeams}</div>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border-subtle">
            <div className="text-xs text-gray-400 font-medium">Submissions</div>
            <div className="text-2xl font-bold font-mono text-purple-400 mt-1">
              {stats.totalSubmissions}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border-subtle">
            <div className="text-xs text-gray-400 font-medium">Judges</div>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
              {stats.totalJudges}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border-subtle">
            <div className="text-xs text-gray-400 font-medium">Assignments</div>
            <div className="text-2xl font-bold font-mono text-gray-300 mt-1">
              {stats.totalAssignments}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border-subtle">
            <div className="text-xs text-gray-400 font-medium">Ballots</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {stats.totalScores}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border-subtle">
            <div className="text-xs text-gray-400 font-medium">Completion</div>
            <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
              {ballotPercent}%
            </div>
          </div>
        </div>
      )}

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-border-subtle rounded-2xl p-6 relative overflow-hidden">
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div>
              <h3 className="font-bold text-white text-base">Score Distribution</h3>
              <p className="text-xs text-gray-400 mt-1">Histogram of normalized tournament scores</p>
            </div>
          </div>
          <ScoreDistributionChart leaderboard={leaderboard} />
        </div>

        <div className="bg-surface border border-border-subtle rounded-2xl p-6 relative overflow-hidden">
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div>
              <h3 className="font-bold text-white text-base">Judge Variance Plot</h3>
              <p className="text-xs text-gray-400 mt-1">Scatter plot of judge calibration vs. variance</p>
            </div>
          </div>
          <JudgeVarianceChart judgeStats={stats?.judgeStats || []} />
        </div>
      </div>

      {/* Rubric Designer */}
      <RubricDesigner />

      {/* Normalization Engine Control */}
      <div className="bg-surface border border-border-subtle rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-white text-lg flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-blue-400" />
            <span>Empirical Bayesian Normalization</span>
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Recompute all Z-Scores and standings using the Python judging microservice.
          </p>
          <div className="text-xs font-mono text-gray-500 mt-2 flex items-center space-x-2">
            <History className="w-3.5 h-3.5" />
            <span>Last Executed: {lastRunTime}</span>
          </div>
        </div>
        <button
          onClick={handleRunNormalization}
          disabled={normalizing}
          className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-glow flex items-center space-x-2 transition-all disabled:opacity-50"
        >
          {normalizing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          <span>{normalizing ? 'Computing Standings...' : 'Run Normalization Engine'}</span>
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="font-bold text-lg text-white">Live Leaderboard</h3>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects or teams..."
                className="w-full pl-9 pr-4 py-2 bg-canvas border border-border-subtle rounded-lg text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="relative w-full sm:w-48">
              <Filter className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <select
                value={trackFilter}
                onChange={(e) => setTrackFilter(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-canvas border border-border-subtle rounded-lg text-sm text-white focus:border-blue-500 focus:outline-none appearance-none"
              >
                {uniqueTracks.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <LeaderboardTable data={filteredLeaderboard} />
      </div>

      <div className="bg-surface border border-border-subtle rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-base text-white flex items-center space-x-2">
          <History className="w-5 h-5 text-gray-400" />
          <span>Security Audit Trail (Tamper-Evident)</span>
        </h3>

        <AuditLogViewer logs={auditLogs} />
      </div>
    </div>
  );
};
