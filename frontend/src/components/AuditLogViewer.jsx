import React, { useState } from 'react';
import { Clock, Shield, ChevronDown, ChevronUp } from 'lucide-react';

export const AuditLogViewer = ({ logs }) => {
  const [expandedLogId, setExpandedLogId] = useState(null);

  if (!logs || logs.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-400 bg-surface border border-border-subtle rounded-xl">
        No audit logs available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {logs.map((log) => {
        const isExpanded = expandedLogId === log._id;
        return (
          <div key={log._id} className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
            <div 
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between cursor-pointer hover:bg-surface-raised transition-colors gap-3"
              onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
            >
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-blue-900/30 text-blue-400 rounded-lg shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    {log.action}
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Target: <span className="text-gray-300 font-medium">{log.targetResource}</span>
                    {log.resourceId && ` (${log.resourceId.slice(-6)})`}
                  </p>
                </div>
              </div>

              <div className="flex items-center sm:justify-end space-x-6 text-xs text-gray-400">
                <div className="flex items-center space-x-1.5 font-mono">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="px-2 py-0.5 bg-gray-800 rounded font-mono text-[10px] text-gray-400">
                    {log.ipHash?.slice(0, 8) || 'unknown'}
                  </span>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
              </div>
            </div>

            {isExpanded && (
              <div className="p-4 bg-canvas border-t border-border-subtle overflow-x-auto">
                <div className="text-[11px] font-mono text-gray-300 space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-500 font-bold mb-1 block">Actor Info:</span>
                      <div className="bg-surface-raised p-2 rounded">
                        <span className="text-blue-400">Role:</span> {log.actorRole || 'System'}
                        <br />
                        <span className="text-blue-400">ID:</span> {log.actorId || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 font-bold mb-1 block">Cryptographic Binding:</span>
                      <div className="bg-surface-raised p-2 rounded truncate" title={log.signature}>
                        <span className="text-purple-400">Signature:</span> {log.signature?.slice(0, 16)}...
                        <br />
                        <span className="text-purple-400">IP Hash:</span> {log.ipHash}
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold mb-1 block mt-2">Payload (Tamper-Evident State Diff):</span>
                    <pre className="bg-surface-raised p-3 rounded-lg text-emerald-400">
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
