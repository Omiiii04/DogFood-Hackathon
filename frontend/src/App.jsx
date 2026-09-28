import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';

import { Home } from './pages/Home';
import { ExploreHackathons } from './pages/ExploreHackathons';
import { Gallery } from './pages/Gallery';
import { TeamDashboard } from './pages/TeamDashboard';
import { SubmissionEditor } from './pages/SubmissionEditor';
import { JudgePortal } from './pages/JudgePortal';
import { AdminDashboard } from './pages/AdminDashboard';
import { ProjectorDisplay } from './pages/ProjectorDisplay';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Rules } from './pages/Rules';
import { FAQ } from './pages/FAQ';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <div className="min-h-screen flex flex-col bg-background text-on-surface">
            <Navbar />
            <main className="flex-1 w-full flex flex-col pt-20">
              <div className="flex-1 w-full max-w-[1280px] mx-auto px-margin-mobile md:px-margin">
                <Routes>

                <Route path="/" element={<Home />} />
                <Route path="/hackathons" element={<ExploreHackathons />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/projector" element={<ProjectorDisplay />} />
                <Route path="/leaderboard" element={<ProjectorDisplay />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                <Route
                  path="/team"
                  element={
                    <ProtectedRoute allowedRoles={['participant', 'organizer', 'admin']}>
                      <TeamDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/submit"
                  element={
                    <ProtectedRoute allowedRoles={['participant', 'organizer', 'admin']}>
                      <SubmissionEditor />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/judging"
                  element={
                    <ProtectedRoute allowedRoles={['judge', 'organizer', 'admin']}>
                      <JudgePortal />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute allowedRoles={['organizer', 'admin']}>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />

                <Route path="/rules" element={<Rules />} />
                <Route path="/faq" element={<FAQ />} />

                <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </main>

            <footer className="w-full bg-surface-container-lowest border-t border-surface-container mt-space-xl">
              <div className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin py-12 lg:py-16">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-gutter mb-12">
                  <div className="lg:col-span-2 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-on-primary"><span className="material-symbols-outlined text-[20px]">military_tech</span></div>
                      <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-bold">DOGFOOD 2026</span>
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant max-w-sm">The premier air-gapped collegiate competitive engineering sprint hosted by Hackathon Raptors. Fueling real-world product acceleration and fair automated evaluation.</p>
                    <div className="flex items-center gap-2 pt-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-on-surface font-label-caps text-label-caps"><span className="material-symbols-outlined text-[14px] text-primary">verified</span>Air-Gapped Scoring Active</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <span className="font-title-md text-title-md text-on-surface font-bold">Competitions</span>
                    <Link to="/hackathons" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors">Explore Hackathons</Link>
                    <Link to="/gallery" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors">Tracks & Bounties</Link>
                    <Link to="/leaderboard" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors">Live Leaderboard</Link>
                    <Link to="/gallery" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors">Submissions Showcase</Link>
                  </div>
                  <div className="flex flex-col gap-3">
                    <span className="font-title-md text-title-md text-on-surface font-bold">Resources</span>
                    <Link to="/rules" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors">Submission Rules</Link>
                    <Link to="/rules#sdk" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors">Air-Gap SDK Specs</Link>
                    <Link to="/team" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors">Mentor Directory</Link>
                    <Link to="/faq" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors">Platform FAQ</Link>
                  </div>
                  <div className="flex flex-col gap-3">
                    <span className="font-title-md text-title-md text-on-surface font-bold">Community & Trust</span>
                    <Link to="/hackathons" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors">Hackathon Raptors Guild</Link>
                    <Link to="/rules#conduct" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors">Code of Conduct</Link>
                    <Link to="/rules#fairplay" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors">Fair Play &amp; Integrity</Link>
                    <Link to="/faq" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors">Contact Organizers</Link>
                  </div>
                </div>
                <div className="pt-8 border-t border-surface-container flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="font-body-sm text-body-sm text-outline">© 2026 Hackathon Raptors Platform. Built for DOGFOOD 2026. All rights reserved.</p>
                  <div className="flex items-center gap-6">
                    <Link to="/rules" className="font-body-sm text-body-sm text-outline hover:text-on-surface transition-colors">Privacy Policy</Link>
                    <Link to="/rules" className="font-body-sm text-body-sm text-outline hover:text-on-surface transition-colors">Terms of Service</Link>
                    <Link to="/rules#fairplay" className="font-body-sm text-body-sm text-outline hover:text-on-surface transition-colors">Security Guidelines</Link>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
