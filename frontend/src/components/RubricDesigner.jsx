import React, { useState, useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import api from '../services/api';
import { Settings, Plus, Trash2, Save, Lock, Unlock, AlertTriangle } from 'lucide-react';

export const RubricDesigner = () => {
  const { addNotification } = useNotification();
  const [criteria, setCriteria] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rubricLocked, setRubricLocked] = useState(false);
  const [eventId, setEventId] = useState(null);

  const fetchRubric = async () => {
    try {
      const res = await api.get('/admin/rubrics');
      if (res.success && res.data) {
        setCriteria(res.data.criteria || []);
        setRubricLocked(res.data.rubricLocked || false);
        setEventId(res.data.eventId);
      }
    } catch (err) {
      addNotification('Failed to load rubric configuration.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRubric();
  }, []);

  const handleAddCriterion = () => {
    setCriteria([
      ...criteria,
      {
        key: `criterion_${Date.now()}`,
        label: 'New Criterion',
        description: '',
        weight: 0.1,
        minScore: 1,
        maxScore: 10,
      }
    ]);
  };

  const handleRemoveCriterion = (index) => {
    const newCriteria = [...criteria];
    newCriteria.splice(index, 1);
    setCriteria(newCriteria);
  };

  const handleChange = (index, field, value) => {
    const newCriteria = [...criteria];
    if (field === 'weight') {
      newCriteria[index][field] = parseFloat(value) || 0;
    } else {
      newCriteria[index][field] = value;
    }
    setCriteria(newCriteria);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.post('/admin/rubrics', { criteria, eventId });
      if (res.success) {
        addNotification('Rubric updated successfully.', 'success');
        fetchRubric();
      }
    } catch (err) {
      addNotification(err.message || 'Failed to save rubric.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLock = async (locked) => {
    try {
      const res = await api.post('/admin/lock-rubric', { eventId, locked });
      if (res.success) {
        addNotification(res.message, 'success');
        setRubricLocked(locked);
      }
    } catch (err) {
      addNotification(err.message || 'Failed to toggle lock.', 'error');
    }
  };

  const totalWeight = criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const isTotalValid = Math.abs(totalWeight - 1.0) < 0.001;

  if (loading) {
    return (
      <div className="bg-surface border border-border-subtle rounded-2xl p-6 flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border-subtle rounded-2xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-white text-lg flex items-center space-x-2">
            <Settings className="w-5 h-5 text-purple-400" />
            <span>Rubric Designer</span>
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Configure judging criteria and weights. Weights must sum to exactly 1.0.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {rubricLocked ? (
            <button
              onClick={() => handleToggleLock(false)}
              className="px-3 py-2 rounded-lg bg-surface-raised hover:bg-surface border border-amber-500/50 text-amber-400 font-semibold text-xs flex items-center space-x-2 transition-all"
            >
              <Unlock className="w-4 h-4" />
              <span>Unlock Rubric</span>
            </button>
          ) : (
            <button
              onClick={() => handleToggleLock(true)}
              disabled={!isTotalValid}
              className="px-3 py-2 rounded-lg bg-surface-raised hover:bg-surface border border-border-subtle text-gray-300 font-semibold text-xs flex items-center space-x-2 transition-all disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              <span>Lock Rubric</span>
            </button>
          )}
        </div>
      </div>

      {rubricLocked && (
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 flex items-start space-x-3 text-amber-200 text-sm">
          <Lock className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
          <p>
            The rubric is currently locked to prevent changes during active scoring. Unlock it if you need to make adjustments (note: modifying weights during an active event may skew results).
          </p>
        </div>
      )}

      <div className="space-y-4">
        {criteria.map((c, i) => (
          <div key={i} className="bg-surface-raised rounded-xl p-4 border border-border-subtle relative flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Criterion Name</label>
                  <input
                    type="text"
                    value={c.label}
                    onChange={(e) => handleChange(i, 'label', e.target.value)}
                    disabled={rubricLocked}
                    className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                    placeholder="e.g. Technical Execution"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Weight (0.0 - 1.0)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={c.weight}
                    onChange={(e) => handleChange(i, 'weight', e.target.value)}
                    disabled={rubricLocked}
                    className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
                <input
                  type="text"
                  value={c.description}
                  onChange={(e) => handleChange(i, 'description', e.target.value)}
                  disabled={rubricLocked}
                  className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                  placeholder="e.g. Evaluates code quality and architecture."
                />
              </div>
            </div>
            
            {!rubricLocked && (
              <button
                onClick={() => handleRemoveCriterion(i)}
                className="mt-6 sm:mt-6 p-2 rounded-lg bg-surface hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors"
                title="Remove Criterion"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {!rubricLocked && (
        <button
          onClick={handleAddCriterion}
          className="w-full py-3 rounded-xl border border-dashed border-border-subtle hover:border-gray-500 text-gray-400 hover:text-white flex items-center justify-center space-x-2 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Add Criterion</span>
        </button>
      )}

      <div className="pt-4 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="text-sm text-gray-400">Total Weight:</div>
          <div className={`text-xl font-mono font-bold ${isTotalValid ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalWeight.toFixed(2)}
          </div>
          {!isTotalValid && (
            <div className="flex items-center space-x-1.5 text-rose-400 text-xs font-medium">
              <AlertTriangle className="w-4 h-4" />
              <span>Weights must sum to exactly 1.0</span>
            </div>
          )}
        </div>
        
        <button
          onClick={handleSave}
          disabled={saving || !isTotalValid || rubricLocked}
          className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-glow flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:shadow-none"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Rubric'}</span>
        </button>
      </div>
    </div>
  );
};
