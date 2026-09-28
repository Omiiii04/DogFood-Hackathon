import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNotification } from '../context/NotificationContext';
import api from '../services/api';
import { User, Mail, Lock } from 'lucide-react';

const TRACKS = ['AI/ML', 'Web3 & Blockchain', 'FinTech', 'HealthTech'];

export const Register = () => {
  const [fullName, setFullName]           = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [role, setRole]                   = useState('participant');
  const [selectedTracks, setSelectedTracks] = useState(['AI/ML']);
  const [loading, setLoading]             = useState(false);

  const { login }           = useAuth();
  const { addNotification } = useNotification();
  const navigate            = useNavigate();

  const handleTrackToggle = (track) => {
    if (selectedTracks.includes(track)) {
      if (selectedTracks.length > 1) setSelectedTracks(selectedTracks.filter((t) => t !== track));
    } else {
      setSelectedTracks([...selectedTracks, track]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        fullName, email, password, role,
        judgeTracks: role === 'judge' ? selectedTracks : [],
      });
      if (res.success && res.data) {
        login(res.data.token, res.data.user);
        addNotification(`Welcome to Dogfood 2026, ${res.data.user.fullName}!`, 'success');
        navigate(role === 'judge' ? '/judging' : '/team');
      }
    } catch (err) {
      addNotification(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { id: 'participant', label: 'Participant', icon: 'person', desc: 'Build & submit a project' },
    { id: 'judge',       label: 'Track Judge', icon: 'gavel',  desc: 'Evaluate submissions' },
  ];

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4 py-12">
      {/* Background gradient blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 right-1/3 w-[600px] h-[400px] bg-gradient-to-bl from-tertiary/6 to-primary/12 rounded-full blur-3xl opacity-70" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[300px] bg-secondary-fixed/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-secondary-container shadow-[0_6px_20px_rgba(70,72,212,0.22)] mb-5">
            <span className="material-symbols-outlined text-[28px] text-on-primary">how_to_reg</span>
          </div>
          <h1 className="font-headline-md text-headline-md text-on-surface font-extrabold tracking-tight">
            Create an Account
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Join as a Participant or Track Judge for DOGFOOD 2026
          </p>
        </div>

        <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-outline" />
                <input
                  type="text" required value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-outline" />
                <input
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@raptors.local"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-outline" />
                <input
                  type="password" required value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            {/* Role Selection */}
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-2">Platform Role</label>
              <div className="grid grid-cols-2 gap-3">
                {roles.map(({ id, label, icon, desc }) => (
                  <button
                    key={id} type="button" onClick={() => setRole(id)}
                    className={`flex flex-col items-start gap-1 p-3.5 rounded-xl border text-left transition-all ${
                      role === id
                        ? 'bg-primary/8 border-primary shadow-[0_0_0_2px_rgba(30,96,255,0.18)]'
                        : 'bg-surface-container-lowest border-outline-variant hover:border-outline hover:bg-surface-container-low'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${role === id ? 'text-primary' : 'text-outline'}`}>{icon}</span>
                    <span className={`font-title-md text-title-md font-bold ${role === id ? 'text-primary' : 'text-on-surface'}`}>{label}</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Judge Track Selection */}
            {role === 'judge' && (
              <div className="pt-3 border-t border-outline-variant/40 space-y-2">
                <label className="block font-label-caps text-label-caps text-tertiary font-semibold uppercase tracking-wider">
                  Evaluation Tracks
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRACKS.map((t) => (
                    <button
                      key={t} type="button" onClick={() => handleTrackToggle(t)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold text-left transition-all ${
                        selectedTracks.includes(t)
                          ? 'bg-tertiary-container/30 border-tertiary text-tertiary'
                          : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:border-outline'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.28)] hover:bg-primary active:scale-[0.98] transition-all disabled:opacity-60 mt-2"
            >
              {loading ? 'Creating Account…' : 'Register'}
            </button>
          </form>

          <div className="text-center font-body-sm text-body-sm text-on-surface-variant">
            Already registered?{' '}
            <Link to="/login" className="text-primary font-semibold hover:underline">
              Sign in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
