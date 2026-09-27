import React from 'react';

export const RubricSlider = ({ criterion, value, onChange }) => {
  const currentVal = value !== undefined ? value : 5.0;
  const weightedContribution = ((currentVal * criterion.weight)).toFixed(2);

  return (
    <div className="p-4 rounded-xl bg-surface-raised border border-border-subtle hover:border-gray-600 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-sm text-gray-100">{criterion.name}</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-blue-950/60 text-blue-300 border border-blue-800/40">
            {Math.round(criterion.weight * 100)}% Weight
          </span>
        </div>
        <div className="text-right">
          <span className="text-xl font-bold font-mono text-blue-400">
            {currentVal.toFixed(1)}
          </span>
          <span className="text-xs text-gray-400 font-mono ml-1">/ 10</span>
        </div>
      </div>

      <input
        type="range"
        min={criterion.scaleMin || 1.0}
        max={criterion.scaleMax || 10.0}
        step="0.5"
        value={currentVal}
        onChange={(e) => onChange(criterion.name, parseFloat(e.target.value))}
        className="w-full h-2 rounded-lg cursor-pointer accent-blue-500 my-2"
      />

      <div className="flex justify-between items-center text-[11px] text-gray-400 font-mono">
        <span>Min: {criterion.scaleMin || 1}</span>
        <span>Contributes: +{weightedContribution} pts</span>
        <span>Max: {criterion.scaleMax || 10}</span>
      </div>
    </div>
  );
};
