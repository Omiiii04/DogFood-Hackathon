import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Menu, X } from 'lucide-react';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (path) => location.pathname === path;

  const navLinkClass = (path) =>
    `transition-colors font-body-md text-body-md whitespace-nowrap ${
      isActive(path)
        ? 'text-primary font-bold'
        : 'text-on-surface-variant hover:text-on-surface'
    }`;

  const mobileNavLinkClass = (path) =>
    `flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium w-full ${
      isActive(path)
        ? 'bg-surface-container text-primary font-bold'
        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
    }`;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/90 backdrop-blur-md border-b border-surface-container shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
      <div className="h-20 max-w-[1280px] mx-auto px-margin-mobile md:px-margin flex items-center justify-between gap-6">
        
        <Link to="/" className="flex items-center gap-3.5 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center text-on-primary shadow-sm shrink-0">
            <span className="material-symbols-outlined text-[24px]">emoji_events</span>
          </div>
          <div className="flex flex-col justify-center gap-0.5">
            <div className="flex items-center gap-2.5">
              <span className="font-headline-sm text-[18px] text-on-surface tracking-tight font-bold whitespace-nowrap leading-none">DOGFOOD 2026</span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-caps text-[10px] border border-outline-variant/40">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
                <span className="whitespace-nowrap font-semibold">Local Air-Gap</span>
              </div>
            </div>
            <span className="font-label-caps text-[10px] text-outline uppercase tracking-wider whitespace-nowrap leading-tight">Hackathon Raptors Platform</span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-5 xl:gap-6 shrink-0">
          <Link to="/gallery" className={navLinkClass('/gallery')}>
            Explore Hackathons
          </Link>
          <Link to="/gallery" className={navLinkClass('/gallery-showcase')}>
            Showcase Gallery
          </Link>
          <Link to="/" className={navLinkClass('/tracks')}>
            Tracks & Prizes
          </Link>
          <Link to="/" className={navLinkClass('/leaderboard')}>
            Leaderboard
          </Link>
          <Link to="/" className={navLinkClass('/faq')}>
            FAQ
          </Link>

          {user && user.role === 'participant' && (
            <>
              <Link to="/team" className={navLinkClass('/team')}>
                My Team
              </Link>
              <Link to="/submit" className={navLinkClass('/submit')}>
                Submission
              </Link>
            </>
          )}

          {user && ['judge', 'organizer', 'admin'].includes(user.role) && (
            <Link to="/judging" className={navLinkClass('/judging')}>
              Judging Queue
            </Link>
          )}

          {user && ['organizer', 'admin'].includes(user.role) && (
            <Link to="/admin" className={navLinkClass('/admin')}>
              Admin Console
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex flex-col text-right mr-2">
                <span className="text-xs font-semibold text-on-surface">{user.fullName}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-primary">
                  {user.role}
                </span>
              </div>
              <button
                onClick={logout}
                title="Log out"
                className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center shrink-0 cursor-pointer hover:bg-surface-container-high transition-colors text-on-surface"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </div>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden sm:inline-flex items-center justify-center h-10 px-4 rounded-full border border-outline-variant font-body-md text-body-md font-semibold text-on-surface hover:bg-surface-container-low hover:text-on-surface transition-all whitespace-nowrap"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center justify-center h-10 px-6 rounded-full bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.28)] hover:bg-primary transition-all shrink-0"
              >
                <span className="leading-none">Register Now</span>
              </Link>
            </>
          )}

          <button
            className="lg:hidden p-2 rounded-lg text-on-surface-variant hover:text-on-surface transition-colors ml-2"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-surface-container bg-surface-container-lowest px-4 pt-3 pb-4 flex flex-col space-y-1 shadow-md">
          <Link to="/gallery" className={mobileNavLinkClass('/gallery')}>
            Explore Hackathons
          </Link>
          <Link to="/gallery" className={mobileNavLinkClass('/gallery-showcase')}>
            Showcase Gallery
          </Link>
          <Link to="/" className={mobileNavLinkClass('/tracks')}>
            Tracks & Prizes
          </Link>
          <Link to="/" className={mobileNavLinkClass('/leaderboard')}>
            Leaderboard
          </Link>
          <Link to="/" className={mobileNavLinkClass('/faq')}>
            FAQ
          </Link>

          {user && user.role === 'participant' && (
            <>
              <Link to="/team" className={mobileNavLinkClass('/team')}>
                My Team
              </Link>
              <Link to="/submit" className={mobileNavLinkClass('/submit')}>
                Submission
              </Link>
            </>
          )}

          {user && ['judge', 'organizer', 'admin'].includes(user.role) && (
            <Link to="/judging" className={mobileNavLinkClass('/judging')}>
              Judging Queue
            </Link>
          )}

          {user && ['organizer', 'admin'].includes(user.role) && (
            <Link to="/admin" className={mobileNavLinkClass('/admin')}>
              Admin Console
            </Link>
          )}

          {!user && (
            <div className="flex flex-col space-y-2 pt-2 border-t border-surface-container mt-2">
              <Link
                to="/login"
                className="text-center px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-low rounded-lg transition-colors border border-outline-variant"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="text-center px-4 py-2.5 text-sm font-bold rounded-lg bg-primary-container text-on-primary transition-all"
              >
                Register Now
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
