import React, { useState } from 'react';
import { Clock, Shield, ChevronDown, ChevronUp } from 'lucide-react';

export const AuditLogViewer = ({ logs }) => {
  const [expandedLogId, setExpandedLogId] = useState(null);

  if (!logs || logs.length === 0) {
    return (
      <div className="p-8 text-center bg-surface-container-low border border-surface-container rounded-xl">
        <span className="material-symbols-outlined text-[36px] text-on-surface-variant mb-2 block">receipt_long</span>
        <p className="font-body-md text-body-md text-on-surface-variant">No audit logs available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const isExpanded = expandedLogId === log._id;
        return (
          <div key={log._id} className="bg-surface-container-lowest border border-surface-container rounded-xl overflow-hidden hover:border-outline-variant/60 transition-colors">
            {/* Row Header */}
            <div
              className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between cursor-pointer hover:bg-surface-container-low/50 transition-colors gap-3"
              onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/8 border border-primary/20 text-primary rounded-xl shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-label-caps text-label-caps text-on-surface font-bold uppercase tracking-wider">
                    {log.action}
                  </h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    Target: <span className="text-on-surface font-medium">{log.targetResource}</span>
                    {log.resourceId && ` (…${log.resourceId.slice(-6)})`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 font-body-sm text-body-sm text-on-surface-variant">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <span className="px-2 py-0.5 bg-surface-container border border-outline-variant/50 rounded-lg font-mono font-label-caps text-label-caps text-on-surface-variant">
                  {log.ipHash?.slice(0, 8) || 'unknown'}
                </span>
                {isExpanded
                  ? <ChevronUp className="w-4 h-4 text-on-surface-variant shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-on-surface-variant shrink-0" />}
              </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="px-4 py-4 bg-surface-container-low border-t border-surface-container overflow-x-auto">
                <div className="font-mono text-xs space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider block mb-1.5">Actor Info</span>
                      <div className="bg-surface-container-lowest border border-outline-variant/40 p-3 rounded-xl space-y-1">
                        <div><span className="text-primary font-semibold">Role:</span> <span className="text-on-surface">{log.actorRole || 'System'}</span></div>
                        <div><span className="text-primary font-semibold">ID:</span> <span className="text-on-surface">{log.actorId || 'N/A'}</span></div>
                      </div>
                    </div>
                    <div>
                      <span className="font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider block mb-1.5">Cryptographic Binding</span>
                      <div className="bg-surface-container-lowest border border-outline-variant/40 p-3 rounded-xl space-y-1">
                        <div className="truncate"><span className="text-secondary font-semibold">Sig:</span> <span className="text-on-surface">{log.signature?.slice(0, 16)}…</span></div>
                        <div><span className="text-secondary font-semibold">IP Hash:</span> <span className="text-on-surface">{log.ipHash}</span></div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className="font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider block mb-1.5">Payload (Tamper-Evident State Diff)</span>
                    <pre className="bg-surface-container-lowest border border-outline-variant/40 p-3 rounded-xl text-status-success overflow-x-auto">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
