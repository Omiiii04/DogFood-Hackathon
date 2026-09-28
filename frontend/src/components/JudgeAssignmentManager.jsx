import React, { useState, useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import api from '../services/api';
import { Users, Search, Play, CheckCircle, Clock } from 'lucide-react';

export const JudgeAssignmentManager = ({ onAssignmentsUpdated }) => {
  const { addNotification } = useNotification();
  const [assignments, setAssignments]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [assigning, setAssigning]       = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/assignments');
      if (res.success && res.data) setAssignments(res.data.assignments || []);
    } catch { addNotification('Failed to load judge assignments.', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAssignments(); }, []);

  const handleAutoAssign = async () => {
    if (!window.confirm('Execute automated greedy judge assignment across all submitted projects? This will overwrite pending assignments!')) return;
    setAssigning(true);
    try {
      const res = await api.post('/admin/assign-judges', { targetPerProject: 3 });
      if (res.success) {
        addNotification(`Created ${res.data.totalAssigned} judge assignments!`, 'success');
        fetchAssignments();
        if (onAssignmentsUpdated) onAssignmentsUpdated();
      }
    } catch (err) { addNotification(err.message || 'Auto-assignment failed.', 'error'); }
    finally { setAssigning(false); }
  };

  const filteredAssignments = assignments.filter((a) => {
    const judgeName = (a.judgeId?.fullName || a.judge?.fullName || '').toLowerCase();
    const projTitle = (a.submissionId?.title || a.submission?.title || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return judgeName.includes(q) || projTitle.includes(q);
  });

  const completedCount = assignments.filter((a) => a.status === 'completed').length;
  const pendingCount   = assignments.length - completedCount;

  return (
    <div className="bg-surface-container-lowest border border-surface-container rounded-2xl p-6 space-y-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-title-md text-title-md text-on-surface font-bold flex items-center gap-2">
            <Users className="w-4 h-4 text-secondary" />
            Judge Assignment Management
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Review and manage active judge evaluation workloads.
          </p>
        </div>
        <button
          onClick={handleAutoAssign} disabled={assigning}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-tertiary-container/30 border border-tertiary/30 text-tertiary font-title-md text-title-md font-bold hover:bg-tertiary-container/50 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          <Play className="w-4 h-4" />
          <span>{assigning ? 'Assigning…' : 'Auto-Assign (Greedy)'}</span>
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-6 p-4 rounded-xl bg-surface-container-low border border-surface-container">
        {[
          { label: 'Total', value: assignments.length, color: 'text-on-surface',       icon: null },
          { label: 'Completed', value: completedCount, color: 'text-status-success',   icon: <CheckCircle className="w-3 h-3" /> },
          { label: 'Pending',   value: pendingCount,   color: 'text-status-warning',   icon: <Clock className="w-3 h-3" /> },
        ].map(({ label, value, color, icon }, i) => (
          <React.Fragment key={label}>
            {i > 0 && <div className="w-px h-10 bg-surface-container" />}
            <div>
              <div className={`flex items-center gap-1 font-label-caps text-label-caps font-semibold ${color}`}>
                {icon}<span>{label}</span>
              </div>
              <div className={`font-headline-sm text-headline-sm font-extrabold mt-0.5 ${color}`}>{value}</div>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
        <input
          type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by judge name or project title…"
          className="w-full pl-9 pr-4 py-2.5 bg-surface-container-lowest border border-outline-variant/60 rounded-xl font-body-md text-body-md text-on-surface placeholder-outline focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-surface-container max-h-96">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead className="bg-surface-container-low sticky top-0 z-10 border-b border-surface-container">
            <tr className="font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider">
              <th className="px-4 py-3">Judge Name</th>
              <th className="px-4 py-3">Project Title</th>
              <th className="px-4 py-3">Track</th>
              <th className="px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center">
                  <div className="flex justify-center mb-2">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">Loading assignments…</span>
                </td>
              </tr>
            ) : filteredAssignments.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center font-body-md text-body-md text-on-surface-variant">
                  No judge assignments found.
                </td>
              </tr>
            ) : (
              filteredAssignments.map((a) => (
                <tr key={a._id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="px-4 py-3 font-title-md text-title-md text-on-surface font-semibold">
                    {a.judgeId?.fullName || a.judge?.fullName || 'Unknown Judge'}
                  </td>
                  <td className="px-4 py-3 font-body-md text-body-md text-on-surface-variant">
                    {a.submissionId?.title || a.submission?.title || 'Unknown Project'}
                  </td>
                  <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">
                    {a.track || a.submissionId?.track || a.submission?.track || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.status === 'completed' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-caps text-label-caps bg-status-success/10 text-status-success border border-status-success/25">
                        <CheckCircle className="w-3 h-3" />Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-caps text-label-caps bg-status-warning/10 text-status-warning border border-status-warning/25">
                        <Clock className="w-3 h-3" />{a.status || 'Pending'}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
