import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const faqs = [
  {
    category: 'Eligibility',
    icon: 'school',
    questions: [
      { q: 'Who can participate in DOGFOOD 2026?', a: 'DOGFOOD 2026 is open to all currently enrolled college/university students worldwide. Each team must have at least one student enrolled at an accredited institution. Organizers and judges are ineligible to participate as competitors.' },
      { q: 'Can I participate solo?', a: 'Yes. Solo entries are accepted. However, tracks marked "Team Only" require a minimum of 2 members. We encourage teams of 2–4 for the best collaborative experience.' },
      { q: 'Are international participants allowed?', a: 'Absolutely. DOGFOOD 2026 is a global competition. Prize disbursement for international winners is handled via wire transfer or equivalent. Tax documentation may be required for prizes over $600 USD.' },
    ],
  },
  {
    category: 'Submissions',
    icon: 'upload_file',
    questions: [
      { q: 'What file formats are accepted?', a: 'Submissions must be OCI-compliant container images exported as a .tar archive. We also accept a manifest.json + source bundle ZIP for static web projects. PDFs or slide decks alone are not accepted.' },
      { q: 'Can I update my submission after the deadline?', a: 'No. Once the cutoff timestamp passes, the submission portal is locked. Ensure you submit a complete, working version before the deadline. We recommend submitting at least 30 minutes early.' },
      { q: 'What happens if my container fails to start?', a: 'The automated judge will log the startup error and assign a score of 0 for all automated criteria. You may still receive partial credit from human judges for documentation and ideation rubrics.' },
    ],
  },
  {
    category: 'Judging',
    icon: 'analytics',
    questions: [
      { q: 'How does the pairwise judging system work?', a: 'Each submission is compared head-to-head with several others across defined rubric dimensions. Judges rate which submission is superior for each criterion. The system aggregates pairwise wins into a final ranking using a modified Elo algorithm.' },
      { q: 'Are automated and human scores combined?', a: 'Yes. The final score is a weighted blend of the automated air-gap evaluation (60%) and human judge pairwise scoring (40%). Individual track weights may vary — check the track details page.' },
      { q: 'How are judge conflicts of interest handled?', a: 'Judges declare conflicts before scoring begins. The system automatically removes conflicted pairs and redistributes the judging load. All assignments and declarations are logged for transparency.' },
    ],
  },
  {
    category: 'Prizes & Results',
    icon: 'emoji_events',
    questions: [
      { q: 'When are results announced?', a: 'Preliminary results are posted to the leaderboard within 2 hours of judging completion. Final results, after appeals, are announced at the closing ceremony and published on the platform.' },
      { q: 'How are prizes distributed?', a: 'Prize-winning teams must complete a 15-minute live demo verification. Upon verification, prizes are disbursed within 30 business days via the team\'s registered payment method.' },
      { q: 'Can I appeal my score?', a: 'Yes. Each team may file one appeal within 48 hours of results publication via the submission portal. Appeals require specific technical evidence. Frivolous appeals may affect future eligibility.' },
    ],
  },
  {
    category: 'Technical',
    icon: 'terminal',
    questions: [
      { q: 'What ports does my container need to expose?', a: 'Your container must expose port 8080 for the judging API. Additionally, port 3000 is available for a UI demo if your track includes one. Containers binding to other ports will fail the network scan.' },
      { q: 'Are GPU resources available?', a: 'GPU compute (NVIDIA A100 equivalent) is available for tracks explicitly marked "GPU Enabled". Request GPU access in your submission manifest. Unverified GPU usage will be flagged by the runtime.' },
      { q: 'How do I test my container locally before submitting?', a: 'Use the DOGFOOD Local Emulator (available on the Resources page). It simulates the air-gapped scoring environment including network isolation, resource caps, and the judging API surface.' },
    ],
  },
];

const FAQItem = ({ question, answer }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-surface-container rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 bg-surface-container-lowest hover:bg-surface-container transition-colors text-left gap-3"
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-title-sm text-title-sm text-on-surface font-semibold">{question}</span>
        <span
          className="material-symbols-outlined text-[20px] text-on-surface-variant shrink-0 transition-transform duration-300"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div className="px-5 py-4 bg-surface-container-lowest border-t border-surface-container">
          <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
};

export const FAQ = () => {
  const [activeCategory, setActiveCategory] = useState('Eligibility');
  const current = faqs.find(f => f.category === activeCategory);

  return (
    <div className="flex flex-col w-full pt-8 pb-16 gap-10">
      {/* Hero */}
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-caps text-label-caps uppercase tracking-wider self-start">
          <span className="material-symbols-outlined text-[14px]">help</span>
          Platform FAQ
        </div>
        <h1 className="font-headline-lg text-headline-lg font-extrabold tracking-tight text-on-surface">
          Frequently Asked Questions
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl leading-relaxed">
          Find answers to common questions about eligibility, submissions, judging, prizes, and technical requirements for DOGFOOD 2026.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            to="/rules"
            className="inline-flex items-center gap-2 px-5 h-10 rounded-full bg-primary text-on-primary font-title-sm text-title-sm font-semibold hover:bg-primary/90 shadow-sm active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">gavel</span>
            View Full Rules
          </Link>
          <Link
            to="/hackathons"
            className="inline-flex items-center gap-2 px-5 h-10 rounded-full bg-surface-container text-on-surface font-title-sm text-title-sm font-semibold hover:bg-surface-container-high active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">explore</span>
            Explore Hackathons
          </Link>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        {faqs.map(f => (
          <button
            key={f.category}
            onClick={() => setActiveCategory(f.category)}
            className={`inline-flex items-center gap-2 px-4 h-10 rounded-full font-title-sm text-title-sm font-semibold transition-all ${
              activeCategory === f.category
                ? 'bg-primary text-on-primary shadow-sm'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{f.icon}</span>
            {f.category}
          </button>
        ))}
      </div>

      {/* Questions */}
      {current && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-secondary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px] text-on-secondary-container">{current.icon}</span>
            </div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">{current.category}</h2>
          </div>
          {current.questions.map(item => (
            <FAQItem key={item.q} question={item.q} answer={item.a} />
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="rounded-2xl bg-surface-container-lowest border border-surface-container p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-title-md text-title-md text-on-surface font-bold mb-1">Still have questions?</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Our organizer team is available during competition hours to help.</p>
        </div>
        <div className="flex gap-3">
          <a
            href="mailto:support@hackathonraptors.io"
            className="inline-flex items-center gap-2 px-5 h-10 rounded-full bg-primary text-on-primary font-title-sm text-title-sm font-semibold hover:bg-primary/90 shadow-sm active:scale-[0.98] transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">mail</span>
            Email Support
          </a>
          <Link
            to="/rules"
            className="inline-flex items-center gap-2 px-5 h-10 rounded-full bg-surface-container text-on-surface font-title-sm text-title-sm font-semibold hover:bg-surface-container-high active:scale-[0.98] transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">menu_book</span>
            Full Rulebook
          </Link>
        </div>
      </div>
    </div>
  );
};
