import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  Shield, Trophy, LayoutGrid, Users, FileEdit,
  Award, LogOut, Menu, X,
} from 'lucide-react';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (path) => location.pathname === path;

  const navLinkClass = (path) =>
    `flex items-center space-x-2 px-3.5 py-2 rounded-lg transition-colors text-sm font-medium ${
      isActive(path)
        ? 'bg-surface-raised text-blue-400 font-semibold border border-blue-500/30'
        : 'text-gray-300 hover:text-white hover:bg-surface-raised/50'
    }`;

  const mobileNavLinkClass = (path) =>
    `flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium w-full ${
      isActive(path)
        ? 'bg-surface-raised text-blue-400 font-semibold border border-blue-500/30'
        : 'text-gray-300 hover:text-white hover:bg-surface-raised/50'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-border-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

        <Link to="/" className="flex items-center space-x-3 group shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg text-white tracking-wide">DOGFOOD 2026</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                LOCAL AIR-GAP
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-medium">Hackathon Raptors Platform</p>
          </div>
        </Link>

        <nav className="hidden md:flex items-center space-x-1">
          <Link to="/gallery" className={navLinkClass('/gallery')}>
            <LayoutGrid className="w-4 h-4" />
            <span>Showcase Gallery</span>
          </Link>

          {user && user.role === 'participant' && (
            <>
              <Link to="/team" className={navLinkClass('/team')}>
                <Users className="w-4 h-4" />
                <span>My Team</span>
              </Link>
              <Link to="/submit" className={navLinkClass('/submit')}>
                <FileEdit className="w-4 h-4" />
                <span>Submission</span>
              </Link>
            </>
          )}

          {user && ['judge', 'organizer', 'admin'].includes(user.role) && (
            <Link to="/judging" className={navLinkClass('/judging')}>
              <Award className="w-4 h-4" />
              <span>Judging Queue</span>
            </Link>
          )}

          {user && ['organizer', 'admin'].includes(user.role) && (
            <Link to="/admin" className={navLinkClass('/admin')}>
              <Shield className="w-4 h-4" />
              <span>Admin Console</span>
            </Link>
          )}
        </nav>

        <div className="flex items-center space-x-3">
          {user ? (
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-gray-200">{user.fullName}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400">
                  {user.role}
                </span>
              </div>
              <button
                id="navbar-logout-btn"
                onClick={logout}
                aria-label="Log out"
                title="Log out"
                className="p-2 rounded-lg bg-surface-raised border border-border-subtle text-gray-400 hover:text-rose-400 hover:border-rose-800 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="hidden md:flex items-center space-x-2">
              <Link
                to="/login"
                id="navbar-login-link"
                className="px-3.5 py-1.5 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Login
              </Link>
              <Link
                to="/register"
                id="navbar-register-link"
                className="px-3.5 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-glow transition-all"
              >
                Sign Up
              </Link>
            </div>
          )}

          <button
            id="navbar-mobile-toggle"
            className="md:hidden p-2 rounded-lg bg-surface-raised border border-border-subtle text-gray-400 hover:text-white transition-colors"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border-subtle bg-surface px-4 pt-3 pb-4 flex flex-col space-y-1">
          <Link to="/gallery" className={mobileNavLinkClass('/gallery')}>
            <LayoutGrid className="w-4 h-4" />
            <span>Showcase Gallery</span>
          </Link>

          {user && user.role === 'participant' && (
            <>
              <Link to="/team" className={mobileNavLinkClass('/team')}>
                <Users className="w-4 h-4" />
                <span>My Team</span>
              </Link>
              <Link to="/submit" className={mobileNavLinkClass('/submit')}>
                <FileEdit className="w-4 h-4" />
                <span>Submission</span>
              </Link>
            </>
          )}

          {user && ['judge', 'organizer', 'admin'].includes(user.role) && (
            <Link to="/judging" className={mobileNavLinkClass('/judging')}>
              <Award className="w-4 h-4" />
              <span>Judging Queue</span>
            </Link>
          )}

          {user && ['organizer', 'admin'].includes(user.role) && (
            <Link to="/admin" className={mobileNavLinkClass('/admin')}>
              <Shield className="w-4 h-4" />
              <span>Admin Console</span>
            </Link>
          )}

          {!user && (
            <div className="flex flex-col space-y-2 pt-2 border-t border-border-subtle mt-2">
              <Link
                to="/login"
                className="text-center px-4 py-2 text-sm font-medium text-gray-300 hover:text-white rounded-lg hover:bg-surface-raised transition-colors"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="text-center px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
