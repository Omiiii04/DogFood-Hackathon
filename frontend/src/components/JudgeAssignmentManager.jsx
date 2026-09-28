import React, { useState, useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import api from '../services/api';
import { Users, Search, Play, CheckCircle, Clock } from 'lucide-react';

export const JudgeAssignmentManager = ({ onAssignmentsUpdated }) => {
  const { addNotification } = useNotification();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/assignments');
      if (res.success && res.data) {
        setAssignments(res.data.assignments || []);
      }
    } catch (err) {
      addNotification('Failed to load judge assignments.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const handleAutoAssign = async () => {
    if (!window.confirm('Execute automated greedy judge assignment across all submitted projects? This will overwrite pending assignments!')) {
      return;
    }
    setAssigning(true);
    try {
      const res = await api.post('/admin/assign-judges', { targetPerProject: 3 });
      if (res.success) {
        addNotification(`Successfully created ${res.data.totalAssigned} judge assignments!`, 'success');
        fetchAssignments();
        if (onAssignmentsUpdated) onAssignmentsUpdated();
      }
    } catch (err) {
      addNotification(err.message || 'Auto-assignment failed.', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const filteredAssignments = assignments.filter((a) => {
    const judgeName = a.judgeId?.fullName?.toLowerCase() || '';
    const projTitle = a.submissionId?.title?.toLowerCase() || '';
    const q = searchQuery.toLowerCase();
    return judgeName.includes(q) || projTitle.includes(q);
  });

  const completedCount = assignments.filter((a) => a.status === 'completed').length;
  const pendingCount = assignments.length - completedCount;

  return (
    <div className="bg-surface border border-border-subtle rounded-2xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-white text-lg flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-400" />
            <span>Judge Assignment Management</span>
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Review and manage active judge evaluation workloads.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleAutoAssign}
            disabled={assigning}
            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-glow flex items-center space-x-2 transition-all disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            <span>{assigning ? 'Assigning...' : 'Auto-Assign (Greedy)'}</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-6 p-4 rounded-xl bg-canvas border border-border-subtle">
        <div>
          <div className="text-xs text-gray-500 font-medium">Total Assignments</div>
          <div className="text-xl font-bold font-mono text-white mt-1">{assignments.length}</div>
        </div>
        <div className="w-px h-10 bg-border-subtle"></div>
        <div>
          <div className="text-xs text-emerald-500 font-medium flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Completed
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">{completedCount}</div>
        </div>
        <div className="w-px h-10 bg-border-subtle"></div>
        <div>
          <div className="text-xs text-amber-500 font-medium flex items-center gap-1">
            <Clock className="w-3 h-3" /> Pending
          </div>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">{pendingCount}</div>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by judge name or project title..."
          className="w-full pl-9 pr-4 py-2 bg-canvas border border-border-subtle rounded-lg text-sm text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-subtle max-h-96">
        <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
          <thead className="bg-canvas sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 font-semibold text-gray-400">Judge Name</th>
              <th className="px-4 py-3 font-semibold text-gray-400">Project Title</th>
              <th className="px-4 py-3 font-semibold text-gray-400">Track</th>
              <th className="px-4 py-3 font-semibold text-gray-400 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  <div className="flex justify-center mb-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  Loading assignments...
                </td>
              </tr>
            ) : filteredAssignments.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No judge assignments found.
                </td>
              </tr>
            ) : (
              filteredAssignments.map((a) => (
                <tr key={a._id} className="hover:bg-canvas/50 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">
                    {a.judgeId?.fullName || 'Unknown Judge'}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {a.submissionId?.title || 'Unknown Project'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {a.track || a.submissionId?.track || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.status === 'completed' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {a.status || 'Pending'}
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
