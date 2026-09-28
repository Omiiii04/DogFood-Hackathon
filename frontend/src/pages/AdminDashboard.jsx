import React, { useState, useEffect } from 'react';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { ScoreDistributionChart } from '../components/ScoreDistributionChart';
import { JudgeVarianceChart } from '../components/JudgeVarianceChart';
import { AuditLogViewer } from '../components/AuditLogViewer';
import { RubricDesigner } from '../components/RubricDesigner';
import { JudgeAssignmentManager } from '../components/JudgeAssignmentManager';
import { useNotification } from '../context/NotificationContext';
import api from '../services/api';
import { Download, History, Search, Filter, AlertTriangle, Lock, FileCheck, UserCheck, Package } from 'lucide-react';
import { HackathonListSection } from '../components/HackathonListSection';
import { getTrackBadgeColor } from '../utils/formatters';

export const AdminDashboard = () => {
  const { addNotification } = useNotification();

  const [stats, setStats]         = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [isFallback, setIsFallback]   = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState('All Tracks');

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [statsRes, lbRes, logsRes, analyticsRes, subsRes] = await Promise.all([
        api.get('/admin/stats').catch(() => null),
        api.get('/admin/leaderboard').catch(() => null),
        api.get('/admin/audit-logs').catch(() => null),
        api.get('/admin/analytics').catch(() => null),
        api.get('/submissions/gallery', { params: { sort: 'newest' } }).catch(() => null),
      ]);
      if (statsRes?.success) setStats(statsRes.data);
      if (lbRes?.success) {
        setLeaderboard(lbRes.data.leaderboard);
        if (lbRes.data.isFallback !== undefined) {
          setIsFallback(Boolean(lbRes.data.isFallback));
        }
      }
      if (logsRes?.success) setAuditLogs(logsRes.data.logs);
      if (analyticsRes?.success) setAnalytics(analyticsRes.data);
      if (subsRes?.success) {
        const subs = Array.isArray(subsRes.data?.submissions)
          ? subsRes.data.submissions
          : Array.isArray(subsRes.data)
          ? subsRes.data
          : [];
        setAllSubmissions(subs);
      }
    } catch (err) { addNotification(err.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAdminData(); }, []);

  const handleRunNormalization = async () => {
    setNormalizing(true);
    try {
      const res = await api.post('/admin/normalize-scores');
      if (res.success) {
        const isDegradedFallback = Boolean(res.data?.is_fallback || res.data?.isFallback);
        if (isDegradedFallback) {
          setIsFallback(true);
          addNotification(
            `Notice: Judging microservice is unavailable. Standings computed using uncalibrated raw weighted-average fallback (${res.data.total_scores_processed} scores across ${res.data.total_submissions || 'projects'}). Re-run normalization once the service is restored to compute official Bayesian Z-score results.`,
            'warning'
          );
        } else {
          setIsFallback(false);
          addNotification(
            `Normalized ${res.data.total_scores_processed} scores across ${res.data.total_submissions || 'projects'} using official Bayesian Z-score normalization!`,
            'success'
          );
        }
        fetchAdminData();
      }
    } catch (err) { addNotification(err.message, 'error'); }
    finally { setNormalizing(false); }
  };

  const handleExport = async (format) => {
    setExporting(true); setShowExportMenu(false);
    try {
      const data = await api.get(`/admin/export/${format}`, { responseType: 'blob' });
      const blob = new Blob([data]);
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href  = url;
      link.setAttribute('download', `dogfood-2026-standings.${format}`);
      document.body.appendChild(link);
      link.click(); link.remove();
      window.URL.revokeObjectURL(url);
      addNotification(`Exported as ${format.toUpperCase()}`, 'success');
    } catch (err) { addNotification(err.message, 'error'); }
    finally { setExporting(false); }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const filteredLeaderboard = (leaderboard || []).filter((item) => {
    const q = (searchQuery || '').toLowerCase();
    const title = (item?.title || '').toLowerCase();
    const teamName = (item?.teamName || '').toLowerCase();
    const matchesSearch = !q || title.includes(q) || teamName.includes(q);
    const matchesTrack  = trackFilter === 'All Tracks' || item?.track === trackFilter;
    return matchesSearch && matchesTrack;
  });

  const uniqueTracks  = ['All Tracks', ...new Set(leaderboard.map((i) => i.track).filter(Boolean))];
  const lastRunLog    = auditLogs.find((l) => l.action === 'NORMALIZATION_EXECUTED');
  const lastRunTime   = lastRunLog ? new Date(lastRunLog.timestamp).toLocaleString() : 'Never';
  const ballotPercent = stats && stats.totalAssignments > 0
    ? ((stats.totalScores / stats.totalAssignments) * 100).toFixed(1)
    : 0;

  const statCards = stats ? [
    { label: 'Participants',  value: stats.totalUsers,       color: 'text-on-surface',       icon: 'group' },
    { label: 'Teams',         value: stats.totalTeams,       color: 'text-primary',          icon: 'workspaces' },
    { label: 'Submissions',   value: stats.totalSubmissions, color: 'text-secondary',        icon: 'folder_special' },
    { label: 'Judges',        value: stats.totalJudges,      color: 'text-tertiary',         icon: 'gavel' },
    { label: 'Assignments',   value: stats.totalAssignments, color: 'text-on-surface-variant', icon: 'assignment' },
    { label: 'Ballots',       value: stats.totalScores,      color: 'text-status-success',   icon: 'how_to_vote' },
    {
      label: 'Completion',
      value: analytics?.judgingMetrics?.completionPercentage !== undefined
        ? `${analytics.judgingMetrics.completionPercentage}%`
        : `${ballotPercent}%`,
      color: 'text-primary',
      icon: 'percent',
    },
  ] : [];

  return (
    <div className="space-y-8 py-8 px-4 md:px-0 max-w-[1280px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-6 border-b border-surface-container gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-secondary font-label-caps text-label-caps font-bold uppercase tracking-wider mb-2">
            <span className="material-symbols-outlined text-[15px]">admin_panel_settings</span>
            <span>Tournament Administration</span>
          </div>
          <h1 className="font-headline-md text-headline-md text-on-surface font-extrabold tracking-tight">Organizer Command Center</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Orchestrate judge assignments, run statistical normalization, and export final results.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRunNormalization} disabled={normalizing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.22)] hover:bg-primary active:scale-[0.98] transition-all disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px]">neurology</span>
            <span>{normalizing ? 'Computing…' : 'Run Normalization'}</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)} disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-status-success/12 border border-status-success/30 text-status-success font-title-md text-title-md font-bold hover:bg-status-success/20 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {exporting ? <div className="w-4 h-4 border-2 border-status-success/30 border-t-status-success rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{exporting ? 'Exporting…' : 'Export Results'}</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-36 bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-xl overflow-hidden z-50 animate-scale-in">
                <button onClick={() => handleExport('csv')} className="w-full text-left px-4 py-2.5 font-body-md text-body-md text-on-surface hover:bg-surface-container-low transition-colors border-b border-surface-container">Export as CSV</button>
                <button onClick={() => handleExport('json')} className="w-full text-left px-4 py-2.5 font-body-md text-body-md text-on-surface hover:bg-surface-container-low transition-colors">Export as JSON</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 animate-fade-in-up">
          {statCards.map(({ label, value, color, icon }) => (
            <div key={label} className="group p-4 rounded-2xl bg-surface-container-lowest border border-surface-container shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="flex items-center gap-2 mb-2">
                <span className={`material-symbols-outlined text-[18px] ${color}`}>{icon}</span>
                <div className="font-label-caps text-label-caps text-on-surface-variant font-semibold">{label}</div>
              </div>
              <div className={`font-headline-sm text-headline-sm font-extrabold ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Track Breakdown */}
      {analytics?.submissionMetrics?.trackBreakdown && Object.keys(analytics.submissionMetrics.trackBreakdown).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3.5 bg-surface-container-low border border-surface-container rounded-xl">
          <span className="font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mr-1">Tracks:</span>
          {Object.entries(analytics.submissionMetrics.trackBreakdown).map(([trackName, count]) => (
            <span key={trackName} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest border border-outline-variant/60 font-body-sm text-body-sm text-on-surface">
              <span className="font-semibold">{trackName}</span>
              <span className="font-bold text-primary">{count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Flagged Anomalies */}
      {analytics?.flaggedAnomalies?.length > 0 && (
        <div className="p-5 rounded-2xl bg-status-warning/8 border border-status-warning/30 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-status-warning" />
            <span className="font-title-md text-title-md text-status-warning font-bold">
              Flagged Judge Anomalies ({analytics.flaggedAnomalies.length})
            </span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Judges with zero score variance (straight-lining) or completion rates under 50%.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {analytics.flaggedAnomalies.map((item) => (
              <div key={item.judgeId} className="p-3.5 rounded-xl bg-surface-container-lowest border border-status-warning/20 space-y-2 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="font-title-md text-title-md text-on-surface font-bold">{item.judgeName}</span>
                  <span className="px-2 py-0.5 rounded-full font-label-caps text-label-caps bg-status-warning/10 text-status-warning border border-status-warning/20">
                    {item.completionPercentage}% Done
                  </span>
                </div>
                <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
                  <span>Ballots: {item.completedBallots}/{item.assignedBallots}</span>
                  <span>Variance: {item.variance}</span>
                </div>
                <div className="font-body-sm text-body-sm text-error font-medium leading-tight pt-1">
                  {item.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked Submissions Panel — shows all submitted/locked projects */}
      {allSubmissions.length > 0 && (
        <div className="bg-surface-container-lowest border border-surface-container rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-5 border-b border-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-low/40">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Lock className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="font-title-md text-title-md text-on-surface font-bold">Locked Submissions</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  All projects finalized by participants — assign judges via the panel below.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/8 border border-primary/20 font-label-caps text-label-caps font-bold text-primary">
              <Package className="w-3.5 h-3.5" />
              {allSubmissions.length} Submission{allSubmissions.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-surface-container">
            {allSubmissions.map((sub, idx) => {
              const scored = leaderboard.some((lb) => lb.title === sub.title);
              return (
                <div key={sub._id || idx} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-container-low/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                      <FileCheck className="w-4 h-4 text-on-surface-variant" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-title-md text-title-md text-on-surface font-semibold truncate">{sub.title || 'Untitled'}</div>
                      <div className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        {sub.teamId?.name || sub.team?.name || '—'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full font-label-caps text-label-caps border text-[10px] font-bold ${getTrackBadgeColor(sub.track)}`}>
                      {sub.track || '—'}
                    </span>
                    {scored ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-status-success/10 border border-status-success/30 font-label-caps text-label-caps font-bold text-status-success text-[10px]">
                        <UserCheck className="w-3 h-3" />
                        Scored
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-status-warning/10 border border-status-warning/30 font-label-caps text-label-caps font-bold text-status-warning text-[10px]">
                        <Lock className="w-3 h-3" />
                        Awaiting Assignment
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-container-lowest border border-surface-container rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="font-title-md text-title-md text-on-surface font-bold mb-1">Score Distribution</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">Histogram of normalized tournament scores</p>
          <ScoreDistributionChart leaderboard={leaderboard} />
        </div>
        <div className="bg-surface-container-lowest border border-surface-container rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="font-title-md text-title-md text-on-surface font-bold mb-1">Judge Variance Plot</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">Scatter: calibration vs. scoring variance</p>
          <JudgeVarianceChart judgeStats={analytics?.judgeVarianceMetrics || stats?.judgeStats || []} />
        </div>
      </div>

      {/* Judge Assignment Manager */}
      <JudgeAssignmentManager onAssignmentsUpdated={fetchAdminData} />

      {/* Rubric Designer */}
      <RubricDesigner />

      {/* Normalization Engine */}
      <div className="bg-surface-container-lowest border border-surface-container rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[22px] text-primary">neurology</span>
            <h3 className="font-title-md text-title-md text-on-surface font-bold">Empirical Bayesian Normalization</h3>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Recompute all Z-Scores and standings using the Python judging microservice.
          </p>
          <div className="flex items-center gap-1.5 mt-2 font-body-sm text-body-sm text-on-surface-variant">
            <History className="w-3.5 h-3.5" />
            <span>Last Executed: {lastRunTime}</span>
          </div>
        </div>
        <button
          onClick={handleRunNormalization} disabled={normalizing}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.22)] hover:bg-primary active:scale-[0.98] transition-all disabled:opacity-60 shrink-0"
        >
          {normalizing && <div className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />}
          <span>{normalizing ? 'Computing Standings…' : 'Run Normalization Engine'}</span>
        </button>
      </div>

      {/* Live Leaderboard */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Live Leaderboard</h3>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input
                type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects or teams…"
                className="w-full pl-9 pr-4 py-2 bg-surface-container-lowest border border-outline-variant/60 rounded-xl font-body-md text-body-md text-on-surface placeholder-outline focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
              />
            </div>
            <div className="relative w-full sm:w-48">
              <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <select
                value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-surface-container-lowest border border-outline-variant/60 rounded-xl font-body-md text-body-md text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none appearance-none transition-all"
              >
                {uniqueTracks.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
        {isFallback && (
          <div className="p-4 rounded-xl bg-status-warning/15 border border-status-warning/40 text-on-surface flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-status-warning shrink-0 mt-0.5" />
            <div>
              <div className="font-title-sm text-title-sm font-bold text-status-warning">
                Uncalibrated Fallback Standings Active
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                These standings were computed using the uncalibrated raw weighted-average fallback because the judging microservice was unavailable. This fallback does not apply judge severity calibration or Bayesian Z-score shrinkage and is not equivalent to primary normalized judging. Please re-run normalization once the judging service is restored.
              </p>
            </div>
          </div>
        )}
        <LeaderboardTable data={filteredLeaderboard} />
      </div>

      {/* Security Audit Trail */}
      <div className="bg-surface-container-lowest border border-surface-container rounded-2xl p-6 space-y-4 shadow-sm">
        <h3 className="font-title-md text-title-md text-on-surface font-bold flex items-center gap-2">
          <History className="w-5 h-5 text-on-surface-variant" />
          Security Audit Trail (Tamper-Evident)
        </h3>
        <AuditLogViewer logs={auditLogs} />
      </div>

      <HackathonListSection
        title="All Hackathons"
        subtitle="Overview of every listed competition — manage, monitor, and review from the organizer console."
      />
    </div>
  );
};
