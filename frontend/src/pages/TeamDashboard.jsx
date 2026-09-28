import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNotification } from '../context/NotificationContext';
import api from '../services/api';
import { Copy, Check, UserPlus, ArrowRight, UserMinus, LogOut, Lock, FileEdit, CheckCircle2, Trophy, Award, Star, MessageSquare, Sparkles, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HackathonListSection } from '../components/HackathonListSection';

const TRACKS = ['AI/ML', 'Web3 & Blockchain', 'FinTech', 'HealthTech'];

export const TeamDashboard = () => {
  const { user, setUser }   = useAuth();
  const { addNotification } = useNotification();

  const [teamData, setTeamData]           = useState(null);
  const [submissionData, setSubmissionData] = useState(null);
  const [evaluationData, setEvaluationData] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [createName, setCreateName]       = useState('');
  const [createTrack, setCreateTrack]     = useState('AI/ML');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [copied, setCopied]               = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState('');
  const [addMemberName, setAddMemberName]   = useState('');
  const [addingMember, setAddingMember]     = useState(false);

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const res = await api.get('/teams/my-team');
      if (res.success && res.data) {
        setTeamData(res.data.team);
        setSubmissionData(res.data.submission);
        setEvaluationData(res.data.evaluation || res.data.submission?.evaluation || null);
      }
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { fetchTeam(); }, []);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!createName.trim()) {
      addNotification('Please enter a team name.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/teams', { name: createName.trim(), track: createTrack });
      if (res.success) {
        addNotification('Team created successfully! Share your join code with teammates.', 'success');
        await fetchTeam();
        setUser((prev) => ({ ...prev, teamId: res.data.team._id }));
      } else {
        addNotification(res.message || res.error || 'Failed to create team.', 'error');
      }
    } catch (err) {
      addNotification(err.message || 'Failed to create team. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinTeam = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/teams/join', { joinCode: joinCodeInput.toUpperCase().trim() });
      if (res.success) {
        addNotification(`Joined team ${res.data.team.name}!`, 'success');
        setTeamData(res.data.team);
        setUser((prev) => ({ ...prev, teamId: res.data.team._id }));
        fetchTeam();
      }
    } catch (err) { addNotification(err.message, 'error'); }
    finally { setSubmitting(false); }
  };

  const handleRemoveMember = async (memberId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from the team?`)) return;
    try {
      const res = await api.delete(`/teams/members/${memberId}`);
      if (res.success) { addNotification(`${memberName} removed.`, 'info'); fetchTeam(); }
    } catch (err) { addNotification(err.message, 'error'); }
  };

  const handleLeaveTeam = async () => {
    if (!window.confirm('Leave this team?')) return;
    try {
      const currentUserId = user?._id || user?.id;
      const res = await api.delete(`/teams/members/${currentUserId}`);
      if (res.success) {
        addNotification('You have left the team.', 'info');
        setUser((prev) => ({ ...prev, teamId: null }));
        setTeamData(null);
        setSubmissionData(null);
        fetchTeam();
      }
    } catch (err) { addNotification(err.message, 'error'); }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!addMemberEmail.trim()) {
      addNotification('Please enter an email address.', 'error');
      return;
    }
    setAddingMember(true);
    try {
      const res = await api.post('/teams/members', { email: addMemberEmail.trim().toLowerCase() });
      if (res.success) {
        addNotification(res.message || 'Member added successfully!', 'success');
        setAddMemberEmail('');
        setAddMemberName('');
        await fetchTeam();
      } else {
        addNotification(res.error || res.message || 'Failed to add member.', 'error');
      }
    } catch (err) {
      addNotification(err.message || 'Failed to add member.', 'error');
    } finally {
      setAddingMember(false);
    }
  };

  const copyJoinCode = () => {
    if (teamData?.joinCode) {
      navigator.clipboard.writeText(teamData.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addNotification('Join code copied!', 'info');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentUserId    = (user?._id || user?.id)?.toString();
  const captainUserId    = (teamData?.captainId || teamData?.captain?._id || teamData?.captain)?.toString();
  const isCurrentUserCaptain = currentUserId && captainUserId && currentUserId === captainUserId;

  const submissionStatusText =
    submissionData?.status === 'locked' || submissionData?.status === 'submitted'
      ? 'Submitted & locked for judging.'
      : submissionData
      ? 'Draft in progress — finalize before deadline.'
      : 'No project submitted yet.';

  const memberInitial = (m) => (m.fullName || m.name || 'U').charAt(0).toUpperCase();

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8 px-4 md:px-0">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-primary font-label-caps text-label-caps font-bold uppercase tracking-wider mb-2">
            <span className="material-symbols-outlined text-[15px]">group</span>
            <span>Team Hub</span>
          </div>
          <h1 className="font-headline-md text-headline-md text-on-surface font-extrabold tracking-tight">Team Management</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Form or join a team (max 4 members). Each team submits one project.
          </p>
        </div>
        {teamData && (
          <button
            onClick={handleLeaveTeam}
            className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-error-container/30 hover:bg-error-container/60 border border-error/30 text-error font-semibold text-sm transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Leave Team</span>
          </button>
        )}
      </div>

      {teamData ? (
        /* ── Team Overview ──────────────────────────────────────── */
        <div className="animate-fade-in-up bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm overflow-hidden">
          {/* Team header banner */}
          <div className="relative overflow-hidden bg-gradient-to-r from-primary-container/40 to-secondary-container/30 px-6 sm:px-8 py-6 border-b border-surface-container">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-primary/5 rounded-full blur-2xl" />
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 relative z-10">
              <div>
                <span className="font-label-caps text-label-caps text-primary font-bold uppercase tracking-wider">Active Hackathon Team</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold mt-1">{teamData.name}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-label-caps text-label-caps font-bold">
                    <span className="material-symbols-outlined text-[13px]">category</span>
                    {teamData.track}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {teamData.members.length} / 4 Members
                  </span>
                </div>
              </div>

              {/* Invite Code — prominent 6-char join code display */}
              <div className="flex flex-col gap-1.5">
                <div className="font-label-caps text-[10px] text-on-surface-variant/70 uppercase tracking-wider font-semibold">6-Char Join Code</div>
                <div
                  onClick={copyJoinCode}
                  className="flex items-center gap-3 bg-surface-container-lowest/90 backdrop-blur-sm border-2 border-primary/30 hover:border-primary/60 rounded-2xl px-4 py-3 shadow-md cursor-pointer transition-all group"
                  title="Click to copy join code"
                >
                  <div className="flex flex-col flex-1">
                    <div className="font-mono text-3xl font-black tracking-[0.25em] text-primary leading-none select-all">
                      {teamData.joinCode}
                    </div>
                    <div className="font-label-caps text-[10px] text-on-surface-variant mt-1 tracking-wider">
                      Share this code with teammates
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyJoinCode(); }}
                    className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 border border-primary/20 text-primary transition-all shrink-0"
                    title="Copy join code"
                  >
                    {copied ? <Check className="w-5 h-5 text-status-success" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Roster */}
          <div className="px-6 sm:px-8 py-6 space-y-4">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider">
              Team Roster
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {teamData.members.map((member) => {
                const memberIdStr   = (member._id || member).toString();
                const isMemberCaptain = memberIdStr === captainUserId;
                return (
                  <div
                    key={memberIdStr}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container-low border border-surface-container hover:border-outline-variant/60 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/12 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                        {memberInitial(member)}
                      </div>
                      <div>
                        <div className="font-title-md text-title-md text-on-surface font-semibold">{member.fullName || member.name}</div>
                        <div className="font-body-sm text-body-sm text-on-surface-variant">{member.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isMemberCaptain && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-warning/10 border border-status-warning/30 text-[10px] font-bold text-status-warning">
                          <span className="material-symbols-outlined text-[11px]">star</span>Captain
                        </span>
                      )}
                      {isCurrentUserCaptain && !isMemberCaptain && (
                        <button
                          onClick={() => handleRemoveMember(memberIdStr, member.fullName || member.name)}
                          className="p-1.5 rounded-lg hover:bg-error-container/30 text-outline hover:text-error transition-colors"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Team Members — captain direct-add form */}
          {teamData.members.length < 4 && (
            <div className="px-6 sm:px-8 py-5 border-t border-surface-container">
              <div className="flex items-center gap-2 mb-4">
                <UserPlus className="w-4 h-4 text-primary" />
                <h3 className="font-label-caps text-label-caps text-primary font-bold uppercase tracking-wider">
                  Add Team Members
                </h3>
                <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold">
                  {4 - teamData.members.length} slot{4 - teamData.members.length !== 1 ? 's' : ''} open
                </span>
              </div>

              {isCurrentUserCaptain ? (
                /* Captain: direct add by email */
                <form onSubmit={handleAddMember} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-label-caps text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">
                        Member Name <span className="text-outline normal-case font-normal">(optional — for reference)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Priya Sharma"
                        value={addMemberName}
                        onChange={(e) => setAddMemberName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60 text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block font-label-caps text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">
                        Registered Email <span className="text-error text-[9px]">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="teammate@example.com"
                        value={addMemberEmail}
                        onChange={(e) => setAddMemberEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60 text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={addingMember || !addMemberEmail.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-title-md text-sm font-bold shadow-[0_4px_14px_rgba(30,96,255,0.22)] hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addingMember ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Adding…</span></>
                    ) : (
                      <><UserPlus className="w-4 h-4" /><span>Add Member</span></>
                    )}
                  </button>
                  <p className="font-body-sm text-[11px] text-on-surface-variant mt-1">
                    The teammate must already be registered. Their account will be added to your team instantly.
                  </p>
                </form>
              ) : (
                /* Non-captain members: show join code to share */
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div className="flex-1">
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      Share the join code with teammates. They can enter it on the Team Hub page to join.
                    </p>
                  </div>
                  <div
                    onClick={copyJoinCode}
                    className="flex items-center gap-3 bg-surface-container-lowest border-2 border-primary/40 hover:border-primary rounded-xl px-4 py-2.5 cursor-pointer transition-all group shrink-0"
                    title="Click to copy join code"
                  >
                    <span className="font-mono text-2xl font-black tracking-[0.2em] text-primary select-all">
                      {teamData.joinCode}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); copyJoinCode(); }}
                      className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 text-primary transition-all"
                      title="Copy join code"
                    >
                      {copied ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submission Status & Evaluation Results */}
          {evaluationData?.isEvaluated || evaluationData?.status === 'completed' || submissionData?.evaluation ? (
            /* ── Evaluated State: Show Official Results ─────────────────────── */
            <div className="border-t border-surface-container bg-surface-container-lowest divide-y divide-surface-container">
              {/* Result Header Banner */}
              <div className="px-6 sm:px-8 py-6 bg-gradient-to-r from-status-success/15 via-primary/10 to-surface-container-lowest">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="mt-1 w-11 h-11 rounded-2xl bg-status-success/20 border border-status-success/40 flex items-center justify-center shrink-0 shadow-sm">
                      <Trophy className="w-6 h-6 text-status-success" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-headline-sm text-headline-sm text-on-surface font-extrabold tracking-tight">
                          Evaluation Results Available
                        </h4>
                        <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-status-success/15 border border-status-success/30 font-label-caps text-label-caps font-bold text-status-success">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Review Complete
                        </span>
                      </div>
                      <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                        Your project has been evaluated by the judging panel and official rubric scores are in.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                    <Link
                      to="/leaderboard"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.22)] hover:bg-primary active:scale-[0.98] transition-all"
                    >
                      <Trophy className="w-4 h-4" />
                      <span>Live Standings</span>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Score & Rubric Breakdown Grid */}
              <div className="px-6 sm:px-8 py-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  {/* Overall Composite Score Card */}
                  <div className="lg:col-span-5 p-6 rounded-2xl bg-surface-container-low border border-outline-variant/60 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-label-caps text-label-caps text-on-surface-variant font-bold uppercase tracking-wider">
                          Overall Composite Score
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold">
                          <Sparkles className="w-3 h-3" />
                          {evaluationData?.ballotCount || 1} Ballot{evaluationData?.ballotCount > 1 ? 's' : ''} Counted
                        </span>
                      </div>
                      <div className="mt-4 flex items-baseline gap-2">
                        <span className="font-mono text-5xl font-black text-primary tracking-tight">
                          {Number(evaluationData?.compositeScore ?? 0).toFixed(1)}
                        </span>
                        <span className="text-xl font-bold text-on-surface-variant">/ 10.0</span>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-on-surface">
                        {Number(evaluationData?.compositeScore ?? 0) >= 8.5
                          ? 'Outstanding · Top Tier Contender'
                          : Number(evaluationData?.compositeScore ?? 0) >= 7.0
                          ? 'High Impact · Strong Execution'
                          : Number(evaluationData?.compositeScore ?? 0) >= 5.0
                          ? 'Passing Standard · Solid Engineering'
                          : 'Developing Prototype · Needs Polish'}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-outline-variant/40 space-y-2 text-xs text-on-surface-variant font-medium">
                      <div className="flex justify-between items-center">
                        <span>Competition Track:</span>
                        <span className="font-bold text-on-surface">{teamData.track}</span>
                      </div>
                      {evaluationData?.normalizedScore != null && (
                        <div className="flex justify-between items-center">
                          <span>Normalized Score:</span>
                          <span className="font-mono font-bold text-primary">{evaluationData.normalizedScore}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span>Status:</span>
                        <span className="font-bold text-status-success flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Verified by Evaluation Jury
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Rubric Criteria Bars */}
                  <div className="lg:col-span-7 p-6 rounded-2xl bg-surface-container-low border border-outline-variant/60 space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-outline-variant/40">
                      <h5 className="font-title-md text-title-md text-on-surface font-bold flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        Rubric Criteria Breakdown
                      </h5>
                      <span className="text-xs text-on-surface-variant font-medium">Scale 1.0 - 10.0</span>
                    </div>

                    <div className="space-y-3.5">
                      {evaluationData?.criteriaBreakdown?.map((crit) => {
                        const pct = Math.min(100, Math.max(10, (crit.averageScore / 10) * 100));
                        return (
                          <div key={crit.key} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-on-surface">{crit.criteriaName}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-on-surface-variant">Weight {Math.round(crit.weight * 100)}%</span>
                                <span className="font-mono font-bold text-primary">{Number(crit.averageScore).toFixed(1)}</span>
                              </div>
                            </div>
                            <div className="w-full h-2.5 rounded-full bg-surface-container overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Judge Feedback & Review Notes */}
                {evaluationData?.feedback && evaluationData.feedback.length > 0 && (
                  <div className="space-y-3">
                    <h5 className="font-title-md text-title-md text-on-surface font-bold flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-tertiary" />
                      Judge Feedback & Evaluation Notes
                    </h5>
                    <div className="space-y-3">
                      {evaluationData.feedback.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/60 space-y-2"
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-tertiary/10 border border-tertiary/20 flex items-center justify-center text-tertiary font-bold text-xs">
                                <span className="material-symbols-outlined text-[15px]">gavel</span>
                              </div>
                              <div>
                                <span className="font-title-md text-sm text-on-surface font-bold">
                                  {item.judgeName}
                                </span>
                                <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container text-on-surface-variant border border-outline-variant/40">
                                  {item.judgeRole}
                                </span>
                              </div>
                            </div>
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                              Ballot Score: {Number(item.score).toFixed(1)} / 10
                            </span>
                          </div>
                          {item.notes ? (
                            <blockquote className="p-3 rounded-lg bg-surface-container-lowest/80 border-l-2 border-primary text-sm text-on-surface italic font-body-md leading-relaxed">
                              "{item.notes}"
                            </blockquote>
                          ) : (
                            <p className="text-xs text-on-surface-variant italic">No confidential comments left.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : submissionData?.status === 'locked' || submissionData?.status === 'submitted' ? (
            /* ── Locked / Submitted State (Pending Evaluation) ─────────────── */
            <div className="px-6 sm:px-8 py-5 border-t border-status-success/30 bg-status-success/6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-9 h-9 rounded-xl bg-status-success/15 border border-status-success/30 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-status-success" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-title-md text-title-md text-on-surface font-bold">Project Submission Status</h4>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-success/12 border border-status-success/30 font-label-caps text-label-caps font-bold text-status-success text-[10px]">
                        <Lock className="w-2.5 h-2.5" />
                        Locked for Evaluation
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-status-success/80 mt-0.5">
                      Your project is finalized and queued for judge evaluation. Results will appear here once judge review ballots are submitted.
                    </p>
                  </div>
                </div>
                <button
                  onClick={fetchTeam}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary font-semibold text-sm hover:bg-primary/20 active:scale-[0.98] transition-all whitespace-nowrap"
                  title="Check for evaluation results"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  <span>Refresh Results</span>
                </button>
              </div>
            </div>
          ) : (
            /* ── Draft / No Submission State ─────────────────────────────── */
            <div className="px-6 sm:px-8 py-5 border-t border-surface-container flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface-container-low/30">
              <div>
                <h4 className="font-title-md text-title-md text-on-surface font-bold">Project Submission Status</h4>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{submissionStatusText}</p>
              </div>
              <Link
                to="/submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.22)] hover:bg-primary active:scale-[0.98] transition-all whitespace-nowrap"
              >
                <FileEdit className="w-4 h-4" />
                <span>{submissionData ? 'Edit Submission' : 'Create Submission'}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      ) : (
        /* ── No Team: Create or Join ─────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in-up">
          {/* Create Team Card */}
          <div className="bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm p-6 space-y-5 hover:shadow-md hover:-translate-y-0.5 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Create a Team</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">You become Team Captain</p>
              </div>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Team Name</label>
                <input
                  type="text" required placeholder="e.g. CyberDinos"
                  value={createName} onChange={(e) => setCreateName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60 text-sm text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
                />
              </div>
              <div>
                <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Competition Track</label>
                <select
                  value={createTrack} onChange={(e) => setCreateTrack(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
                >
                  {TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <button
                type="submit"
                id="create-team-btn"
                disabled={submitting || !createName.trim()}
                className="w-full py-3 rounded-xl bg-primary text-on-primary font-title-md text-title-md font-bold shadow-[0_4px_14px_rgba(30,96,255,0.28)] hover:shadow-[0_6px_18px_rgba(30,96,255,0.38)] hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Creating Team…</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">group_add</span>
                    <span>Create Team</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Join Team Card */}
          <div className="bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm p-6 space-y-5 hover:shadow-md hover:-translate-y-0.5 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-status-success/10 border border-status-success/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px] text-status-success">group_add</span>
              </div>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Join a Team</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Enter your 6-char invite code</p>
              </div>
            </div>

            <form onSubmit={handleJoinTeam} className="space-y-4">
              <div>
                <label className="block font-label-caps text-label-caps text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">6-Character Join Code</label>
                <input
                  type="text" required maxLength={6} placeholder="e.g. RAPTOR"
                  value={joinCodeInput} onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-3 rounded-xl bg-surface-container-low border border-outline-variant/60 text-lg font-mono font-bold tracking-[0.22em] text-center text-on-surface placeholder-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all uppercase"
                />
              </div>
              <button
                type="submit" disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant text-on-surface font-title-md text-title-md font-bold hover:border-outline active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {submitting ? 'Joining…' : 'Join Team'}
              </button>
            </form>
          </div>
        </div>
      )}
      <HackathonListSection
        title="Active Hackathons"
        subtitle="Browse all open competitions — register or join a team to participate."
      />
    </div>
  );
};
