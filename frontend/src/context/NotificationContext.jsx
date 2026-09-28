import React, { createContext, useState, useContext, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setNotifications((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, duration);
    }
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ addNotification, removeNotification }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`pointer-events-auto flex items-center justify-between px-4 py-3 rounded-xl border shadow-[0_8px_24px_rgba(0,72,212,0.12)] backdrop-blur-md min-w-[300px] max-w-md transition-all duration-300 animate-fade-in-up ${
              n.type === 'success'
                ? 'bg-white/90 border-status-success/30 text-on-surface'
                : n.type === 'error'
                ? 'bg-white/90 border-error/30 text-on-surface'
                : n.type === 'warning'
                ? 'bg-white/90 border-status-warning/30 text-on-surface'
                : 'bg-white/90 border-primary/20 text-on-surface'
            }`}
          >
            <div className="flex items-center gap-3">
              {n.type === 'success' && <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />}
              {n.type === 'error'   && <AlertCircle  className="w-4 h-4 text-error shrink-0" />}
              {n.type === 'warning' && <AlertTriangle className="w-4 h-4 text-status-warning shrink-0" />}
              {n.type === 'info'    && <Info className="w-4 h-4 text-primary shrink-0" />}
              <span className="font-body-md text-body-md font-medium">{n.message}</span>
            </div>
            <button
              onClick={() => removeNotification(n.id)}
              className="text-on-surface-variant hover:text-on-surface ml-3 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => useContext(NotificationContext);
