import React, { useState, useEffect } from 'react';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { useNotification } from '../context/NotificationContext';
import api from '../services/api';
import {
  Shield,
  Users,
  Cpu,
  Download,
  History,
} from 'lucide-react';

export const AdminDashboard = () => {
  const { addNotification } = useNotification();

  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [assigning, setAssigning] = useState(false);
  const [normalizing, setNormalizing] = useState(false);

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
          `Normalized ${res.data.total_scores_processed} scores across ${res.data.total_submissions} projects!`,
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
            onClick={handleRunNormalization}
            disabled={normalizing}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-glow flex items-center space-x-2 transition-all disabled:opacity-50"
          >
            <Cpu className="w-4 h-4" />
            <span>{normalizing ? 'Computing...' : 'Run Normalization'}</span>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
            <div className="text-xs text-gray-400 font-medium">Ballots Recorded</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {stats.totalScores}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border-subtle">
            <div className="text-xs text-gray-400 font-medium">Assignments</div>
            <div className="text-2xl font-bold font-mono text-gray-300 mt-1">
              {stats.totalAssignments}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <LeaderboardTable data={leaderboard} />
      </div>

      <div className="bg-surface border border-border-subtle rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-base text-white flex items-center space-x-2">
          <History className="w-5 h-5 text-gray-400" />
          <span>Security Audit Trail (Tamper-Evident)</span>
        </h3>

        <div className="divide-y divide-border-subtle font-mono text-xs">
          {auditLogs.length === 0 ? (
            <p className="py-4 text-gray-500 font-sans text-sm">No audit events recorded yet.</p>
          ) : (
            auditLogs.slice(0, 10).map((log) => (
              <div key={log._id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-blue-300">
                    {log.action}
                  </span>
                  <span className="text-gray-300">
                    by <strong className="text-white">{log.actorId?.fullName || log.actorRole}</strong>
                  </span>
                </div>
                <div className="text-gray-500">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
