import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNotification } from '../context/NotificationContext';
import api from '../services/api';
import { Lock, Mail, KeyRound } from 'lucide-react';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.success && res.data) {
        login(res.data.token, res.data.user);
        addNotification(`Welcome back, ${res.data.user.fullName}!`, 'success');
        if (res.data.user.role === 'judge') {
          navigate('/judging');
        } else if (['organizer', 'admin'].includes(res.data.user.role)) {
          navigate('/admin');
        } else {
          navigate('/gallery');
        }
      }
    } catch (err) {
      addNotification(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (roleEmail) => {
    setEmail(roleEmail);
    setPassword('Raptor2026!');
  };

  const quickFillRoles = [
    { label: 'Organizer', email: 'organizer@dogfood.local', icon: 'admin_panel_settings', color: 'text-secondary' },
    { label: 'AI Judge',  email: 'judge.ai@dogfood.local',  icon: 'gavel',               color: 'text-tertiary' },
    { label: 'Participant', email: 'alex@dogfood.local',    icon: 'person',              color: 'text-primary' },
  ];

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4 py-12">
      {/* Background gradient blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/3 w-[600px] h-[400px] bg-gradient-to-br from-primary/8 to-secondary-fixed/20 rounded-full blur-3xl opacity-60" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-tertiary-container/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-container shadow-[0_6px_20px_rgba(30,96,255,0.25)] mb-5">
            <span className="material-symbols-outlined text-[28px] text-on-primary">emoji_events</span>
          </div>
          <h1 className="font-headline-md text-headline-md text-on-surface font-extrabold tracking-tight">
            Sign in to DOGFOOD
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Air-gapped hackathon platform · Offline-first
          </p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-outline" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@raptors.local"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-outline" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.28)] hover:bg-primary active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {loading ? 'Authenticating…' : 'Sign In'}
            </button>
          </form>

          {/* Quick-fill */}
          <div className="pt-4 border-t border-outline-variant/40">
            <div className="flex items-center gap-1.5 mb-3">
              <KeyRound className="w-3.5 h-3.5 text-status-warning" />
              <span className="font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider">
                Quick-Fill Seeded Accounts
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {quickFillRoles.map(({ label, email: e, icon, color }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => fillCredentials(e)}
                  className="flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl bg-surface-container-low border border-outline-variant/60 hover:border-outline hover:bg-surface-container transition-all group"
                >
                  <span className={`material-symbols-outlined text-[20px] ${color} group-hover:scale-110 transition-transform`}>{icon}</span>
                  <span className="font-label-caps text-[10px] text-on-surface-variant font-semibold tracking-wide">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="text-center font-body-sm text-body-sm text-on-surface-variant">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary font-semibold hover:underline">
              Register here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
