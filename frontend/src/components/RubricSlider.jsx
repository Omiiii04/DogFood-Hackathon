import React from 'react';

export const RubricSlider = ({ criterion, value, onChange }) => {
  const currentVal = value !== undefined && value !== null ? value : 5.0;
  const weightedContribution = (currentVal * criterion.weight).toFixed(2);

  const handleChipClick = (val) => onChange(criterion.name, val);

  const handleKeyDown = (e) => {
    const key = e.key;
    if (key >= '1' && key <= '9') { e.preventDefault(); onChange(criterion.name, parseFloat(key)); }
    else if (key === '0')          { e.preventDefault(); onChange(criterion.name, 10.0); }
  };

  // Score color band
  const scoreColor =
    currentVal >= 8   ? 'text-status-success' :
    currentVal >= 5   ? 'text-primary'         :
    currentVal >= 3   ? 'text-status-warning'  :
                        'text-error';

  return (
    <div
      className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container hover:border-outline-variant transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-title-md text-title-md text-on-surface font-semibold">{criterion.name}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full font-label-caps text-label-caps bg-primary/8 border border-primary/20 text-primary font-bold">
            {Math.round(criterion.weight * 100)}%
          </span>
        </div>
        <div className="text-right">
          <span className={`font-headline-sm text-headline-sm font-extrabold leading-none ${scoreColor}`}>
            {currentVal.toFixed(1)}
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant ml-1">/ 10</span>
        </div>
      </div>

      {/* Quick chips */}
      <div className="flex gap-1.5 mb-3">
        {[1, 3, 5, 7, 10].map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => handleChipClick(chip)}
            className={`flex-1 py-1 rounded-lg font-label-caps text-label-caps font-bold border transition-all active:scale-95 ${
              currentVal === chip
                ? 'bg-primary-container text-on-primary border-primary shadow-sm'
                : 'bg-surface-container-low border-outline-variant/60 text-on-surface-variant hover:border-outline hover:text-on-surface'
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Slider */}
      <input
        type="range"
        min={criterion.scaleMin || 1.0}
        max={criterion.scaleMax || 10.0}
        step="0.5"
        value={currentVal}
        onChange={(e) => onChange(criterion.name, parseFloat(e.target.value))}
        className="w-full cursor-pointer my-1"
        tabIndex={-1}
      />

      {/* Footer metadata */}
      <div className="flex justify-between items-center font-label-caps text-label-caps text-on-surface-variant mt-1.5">
        <span>Min: {criterion.scaleMin || 1}</span>
        <span className="text-primary font-bold">+{weightedContribution} pts</span>
        <span>Max: {criterion.scaleMax || 10}</span>
      </div>
    </div>
  );
};
