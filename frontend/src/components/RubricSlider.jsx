import React from 'react';

export const RubricSlider = ({ criterion, value, onChange }) => {
  const currentVal = value !== undefined ? value : 5.0;
  const weightedContribution = ((currentVal * criterion.weight)).toFixed(2);

  const handleChipClick = (val) => {
    onChange(criterion.name, val);
  };

  const handleKeyDown = (e) => {
    const key = e.key;
    if (key >= '1' && key <= '9') {
      e.preventDefault();
      onChange(criterion.name, parseFloat(key));
    } else if (key === '0') {
      e.preventDefault();
      onChange(criterion.name, 10.0);
    }
  };

  return (
    <div
      className="p-4 rounded-xl bg-surface-raised border border-border-subtle hover:border-gray-600 transition-colors focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
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

      <div className="flex space-x-2 mb-3">
        {[1, 3, 5, 7, 9].map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => handleChipClick(chip)}
            className={`px-3 py-1 rounded text-xs font-mono font-bold border transition-colors focus:outline-none ${
              currentVal === chip
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-canvas border-border-subtle text-gray-400 hover:text-gray-200 hover:border-gray-500'
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      <input
        type="range"
        min={criterion.scaleMin || 1.0}
        max={criterion.scaleMax || 10.0}
        step="0.5"
        value={currentVal}
        onChange={(e) => onChange(criterion.name, parseFloat(e.target.value))}
        className="w-full h-2 rounded-lg cursor-pointer accent-blue-500 my-2"
        tabIndex={-1}
      />

      <div className="flex justify-between items-center text-[11px] text-gray-400 font-mono mt-1">
        <span>Min: {criterion.scaleMin || 1}</span>
        <span>Contributes: +{weightedContribution} pts</span>
        <span>Max: {criterion.scaleMax || 10}</span>
      </div>
    </div>
  );
};
