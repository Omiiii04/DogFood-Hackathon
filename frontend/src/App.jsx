import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';

import { Home } from './pages/Home';
import { Gallery } from './pages/Gallery';
import { TeamDashboard } from './pages/TeamDashboard';
import { SubmissionEditor } from './pages/SubmissionEditor';
import { JudgePortal } from './pages/JudgePortal';
import { AdminDashboard } from './pages/AdminDashboard';
import { ProjectorDisplay } from './pages/ProjectorDisplay';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <div className="min-h-screen flex flex-col bg-canvas text-gray-100 font-sans selection:bg-blue-600 selection:text-white">
            <Navbar />
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/projector" element={<ProjectorDisplay />} />
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

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>

            <footer className="border-t border-border-subtle bg-surface/50 py-6 mt-16 text-center text-xs text-gray-500">
              <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
                <span>Dogfood 2026 • Hackathon Raptors Air-Gapped Platform</span>
                <span className="font-mono text-[11px] text-gray-400">
                  Containerized Local Deployment (Node 20 • FastAPI • Mongo 7 • React 18)
                </span>
              </div>
            </footer>
          </div>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
