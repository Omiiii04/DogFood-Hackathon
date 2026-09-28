import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const sections = [
  {
    id: 'submission',
    icon: 'upload_file',
    label: 'Submission Rules',
    color: 'primary',
    items: [
      { title: 'Container Package Format', body: 'All submissions must be packaged as a Docker-compatible OCI container with a valid manifest.json at the root. The container must not exceed 4 GB compressed.' },
      { title: 'Air-Gap Compliance', body: 'Submissions are evaluated in a fully air-gapped environment. No external network calls, CDN assets, or runtime API keys are permitted. All dependencies must be bundled.' },
      { title: 'Deadline Policy', body: 'Submissions are locked at the cutoff timestamp. Late entries will not be considered. The timestamp is set per hackathon and displayed in the submission portal countdown.' },
      { title: 'Team Authorship', body: 'Every team member listed in the submission must have contributed code. Solo contributions posing as team efforts will be disqualified upon audit.' },
    ],
  },
  {
    id: 'sdk',
    icon: 'code_blocks',
    label: 'Air-Gap SDK Specs',
    color: 'secondary',
    items: [
      { title: 'Supported Runtimes', body: 'Node.js ≥ 18 LTS, Python ≥ 3.11, Go ≥ 1.22, Rust ≥ 1.78, Java ≥ 21 LTS, and .NET ≥ 8.0 are supported inside the air-gapped environment.' },
      { title: 'Scoring Interface', body: 'Your container must expose an HTTP server on port 8080 with a GET /health and POST /evaluate endpoint following the DOGFOOD Judging Protocol v2 schema.' },
      { title: 'Resource Limits', body: 'Each container gets 4 vCPUs, 8 GB RAM, and 10 GB ephemeral disk. GPU compute is available only for tracks marked "GPU Enabled". Execution timeout is 90 seconds per judging call.' },
      { title: 'Prohibited Libraries', body: 'Any library that establishes an external socket, spawns child processes to call system curl/wget, or reads from /etc/hosts for DNS resolution is prohibited.' },
    ],
  },
  {
    id: 'conduct',
    icon: 'gavel',
    label: 'Code of Conduct',
    color: 'tertiary',
    items: [
      { title: 'Respect & Inclusivity', body: 'All participants, judges, and organizers are expected to communicate respectfully. Discrimination, harassment, or hostile behavior of any kind will result in immediate disqualification.' },
      { title: 'Fair Competition', body: 'Plagiarism, copying competitor code, or using proprietary datasets without license is strictly prohibited. All work must be original to the hackathon period unless clearly noted as open-source dependencies.' },
      { title: 'Judge Integrity', body: 'Judges must recuse themselves from scoring projects where a conflict of interest exists (e.g., team members are personal acquaintances). Pairwise scoring is logged and auditable.' },
      { title: 'Reporting Violations', body: 'Report violations via the Contact Organizers form or email conduct@hackathonraptors.io. All reports are handled confidentially within 24 hours.' },
    ],
  },
  {
    id: 'fairplay',
    icon: 'verified_user',
    label: 'Fair Play & Integrity',
    color: 'primary',
    items: [
      { title: 'Automated Audit Trails', body: 'Every submission undergoes automated diff analysis, license scanning, and dependency fingerprinting. Statistical anomaly detection flags outlier scores for human review.' },
      { title: 'Pairwise Variance Review', body: 'When judge variance exceeds the configured threshold (default σ > 1.5), the submission is routed to a senior judge panel for reconciliation.' },
      { title: 'Appeals Process', body: 'Teams may file one appeal per hackathon within 48 hours of results publication. Appeals must include specific technical evidence; "I disagree with the score" is not sufficient grounds.' },
      { title: 'Prize Verification', body: 'Top-ranked teams must pass a 15-minute live demo session with the organizer panel before prizes are disbursed. The demo environment mirrors the air-gapped scoring environment.' },
    ],
  },
];

const AccordionItem = ({ title, body }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-surface-container rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 bg-surface-container-lowest hover:bg-surface-container transition-colors text-left gap-3"
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-title-sm text-title-sm text-on-surface font-semibold">{title}</span>
        <span
          className="material-symbols-outlined text-[20px] text-on-surface-variant shrink-0 transition-transform duration-300"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div className="px-5 py-4 bg-surface-container-lowest border-t border-surface-container">
          <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{body}</p>
        </div>
      )}
    </div>
  );
};

export const Rules = () => {
  const [activeSection, setActiveSection] = useState('submission');
  const current = sections.find(s => s.id === activeSection);

  return (
    <div className="flex flex-col w-full pt-8 pb-16 gap-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-primary-container to-secondary p-8 sm:p-10 text-on-primary shadow-lg">
        <div className="absolute -right-8 -bottom-10 opacity-10 pointer-events-none">
          <span className="material-symbols-outlined text-[240px]">gavel</span>
        </div>
        <div className="relative z-10 flex flex-col gap-3 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-on-primary/15 text-on-primary font-label-caps text-label-caps uppercase tracking-wider self-start backdrop-blur-sm">
            <span>DOGFOOD 2026 — Official Rulebook</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg font-extrabold tracking-tight text-on-primary">
            Rules, Specs & Conduct
          </h1>
          <p className="font-body-md text-body-md text-on-primary/90 leading-relaxed">
            Everything you need to know about submission requirements, air-gap specs, community standards, and fair-play policies for DOGFOOD 2026.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              to="/submit"
              className="inline-flex items-center gap-2 px-5 h-10 rounded-full bg-surface-container-lowest text-primary font-title-sm text-title-sm font-bold hover:bg-surface-container-low shadow-sm active:scale-[0.98] transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">publish</span>
              Submit Project
            </Link>
            <Link
              to="/hackathons"
              className="inline-flex items-center gap-2 px-5 h-10 rounded-full bg-on-primary/10 border border-on-primary/20 text-on-primary font-title-sm text-title-sm font-semibold hover:bg-on-primary/20 backdrop-blur-sm active:scale-[0.98] transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">explore</span>
              Explore Hackathons
            </Link>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`inline-flex items-center gap-2 px-4 h-10 rounded-full font-title-sm text-title-sm font-semibold transition-all ${
              activeSection === s.id
                ? 'bg-primary text-on-primary shadow-sm'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Section Content */}
      {current && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px] text-on-primary-container">{current.icon}</span>
            </div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">{current.label}</h2>
          </div>
          {current.items.map(item => (
            <AccordionItem key={item.title} title={item.title} body={item.body} />
          ))}
        </div>
      )}

      {/* Quick Links Bottom */}
      <div className="rounded-2xl bg-surface-container-lowest border border-surface-container p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-title-md text-title-md text-on-surface font-bold mb-1">Need help?</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Reach out to our organizer team with any questions about rules or eligibility.</p>
        </div>
        <a
          href="mailto:conduct@hackathonraptors.io"
          className="inline-flex items-center gap-2 px-5 h-10 rounded-full bg-primary text-on-primary font-title-sm text-title-sm font-semibold hover:bg-primary/90 shadow-sm active:scale-[0.98] transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">mail</span>
          Contact Organizers
        </a>
      </div>
    </div>
  );
};
