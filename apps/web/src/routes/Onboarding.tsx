// Popcorn Language — Web Onboarding + Your Journey
// Onboarding is full-bleed (no app shell). Journey uses the 3-pane shell.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { JourneySummaryResponse, RelationshipCard, Achievement } from '@popcorn/shared';
import { WebI, RELATIONSHIP_LABEL, WebRelationshipDots, WebDock, WebNavRail } from '../components/shared';

// ============================================================
// ONBOARDING — full-bleed, 3 steps
// ============================================================

function OnboardingShell({ step, totalSteps = 3, onBack, children }: { step: number; totalSteps?: number; onBack?: () => void; children?: any }) {
  return (
    <div className="min-h-screen w-full relative" style={{ background: 'var(--bg)' }}>
      {/* Ambient cool wash — green + indigo, no warm peach */}
      <div className="absolute pointer-events-none" style={{
        top: '-10%', right: '-5%', width: 700, height: 700,
        background: 'radial-gradient(circle, oklch(0.92 0.06 150 / 0.35), transparent 65%)',
        filter: 'blur(60px)',
      }} />
      <div className="absolute pointer-events-none" style={{
        bottom: '-10%', left: '-5%', width: 700, height: 700,
        background: 'radial-gradient(circle, oklch(0.92 0.05 240 / 0.25), transparent 65%)',
        filter: 'blur(60px)',
      }} />

      {/* Top brand bar */}
      <header className="relative z-10 px-10 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg grid place-items-center"
               style={{ width: 32, height: 32, background: 'var(--brand-bg)', color: 'var(--brand-ink)' }}>
            <span style={{ fontWeight: 700, fontSize: 18, lineHeight: 1 }}>P</span>
          </div>
          <div className="leading-tight">
            <div className="font-serif text-[18px]">Popcorn Language</div>
            <div className="text-[9.5px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
              setup · 0{step + 1}/0{totalSteps}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <StepDots step={step} total={totalSteps} />
        </div>
      </header>

      <main className="relative z-10">{children}</main>
    </div>
  );
}

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className="rounded-full transition-all"
              style={{
                width: i === step ? 22 : 6,
                height: 6,
                background: i <= step ? 'var(--accent)' : 'var(--hairline-strong)',
              }} />
      ))}
    </div>
  );
}

// ---------- Step 1: Welcome ----------

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <OnboardingShell step={0}>
      <div className="max-w-[1200px] mx-auto px-10 grid grid-cols-12 gap-12 items-center"
           style={{ minHeight: 'calc(100vh - 120px)' }}>
        <div className="col-span-7">
          <div className="fade-up">
            <span className="text-[10px] font-mono uppercase tracking-[0.22em]" style={{ color: 'var(--muted)' }}>
              practice English · with friends, not flashcards
            </span>
          </div>
          <h1 className="font-serif text-[88px] leading-[0.95] mt-5 fade-up" style={{ animationDelay: '0.06s' }}>
            Practice English<br />
            the way you'd<br />
            <span style={{ color: 'var(--accent-ink)' }}>practice life —</span><br />
            with friends.
          </h1>
          <p className="text-[16px] leading-relaxed mt-8 max-w-[520px] fade-up"
             style={{ color: 'var(--ink-2)', animationDelay: '0.14s' }}>
            Chat with AI characters who actually get to know you. Sometimes — when the moment is
            right — they'll suggest practicing real situations together. Everything runs on your
            own machine.
          </p>

          <div className="mt-10 flex items-center gap-4 fade-up" style={{ animationDelay: '0.22s' }}>
            <button onClick={onNext}
                    className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[15px] font-medium transition"
                    style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-ink)' }}>
              Get started
              <span className="transition group-hover:translate-x-1">{WebI.arrowR}</span>
            </button>
            <button className="text-[13px] transition hover:text-[var(--ink)] underline underline-offset-2"
                    style={{ color: 'var(--muted)' }}>
              See how it works
            </button>
          </div>

          <div className="mt-12 flex items-center gap-1.5 fade-up" style={{ animationDelay: '0.30s' }}>
            <Pill>Local-first · qwen3.5:9b</Pill>
            <Pill>EN ← 中文</Pill>
            <Pill>CEFR A2 – B2</Pill>
            <Pill>macOS · Windows · Linux</Pill>
          </div>
        </div>

        {/* Visual side */}
        <div className="col-span-5 fade-up" style={{ animationDelay: '0.10s' }}>
          <PreviewStack />
        </div>
      </div>
    </OnboardingShell>
  );
}

function PreviewStack() {
  return (
    <div className="relative" style={{ height: 460 }}>
      {/* Card 3: behind */}
      <div className="absolute right-0 bottom-0 rounded-2xl p-4"
           style={{
             width: 360, transform: 'rotate(-3deg) translate(-20px, 20px)',
             background: 'var(--surface)', border: '1px solid var(--hairline)',
             boxShadow: '0 16px 40px -16px oklch(0.18 0.02 60 / 0.20)',
           }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full grid place-items-center"
               style={{ background: 'oklch(0.93 0.04 340)', color: 'oklch(0.48 0.10 340)', fontSize: 14 }}>E</div>
          <span className="text-[13px] font-medium">Emma</span>
          <span className="text-[10px] font-mono uppercase tracking-wider ml-auto" style={{ color: 'var(--muted)' }}>5h</span>
        </div>
        <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          okok send me a pic of your cat RIGHT NOW i need serotonin
        </p>
      </div>

      {/* Card 2: middle */}
      <div className="absolute right-12 top-16 rounded-2xl p-4"
           style={{
             width: 360, transform: 'rotate(2deg)',
             background: 'var(--surface)', border: '1px solid var(--hairline)',
             boxShadow: '0 20px 50px -20px oklch(0.18 0.02 60 / 0.25)',
           }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full grid place-items-center"
               style={{ background: 'oklch(0.93 0.02 250)', color: 'oklch(0.40 0.06 250)', fontSize: 13 }}>陈</div>
          <span className="text-[13px] font-medium">Mr. Chen</span>
          <span className="text-[10px] font-mono uppercase tracking-wider ml-auto" style={{ color: 'var(--muted)' }}>1h</span>
        </div>
        <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Let me know when you have a moment to sync.
        </p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
          有空时告诉我一声，我们对一下。
        </p>
      </div>

      {/* Card 1: front (Lily, with sparkle) */}
      <div className="absolute right-0 top-0 rounded-2xl p-4"
           style={{
             width: 380,
             background: 'var(--surface)', border: '1px solid var(--hairline)',
             boxShadow: '0 24px 60px -24px oklch(0.18 0.02 60 / 0.30)',
           }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="relative">
            <div className="w-9 h-9 rounded-full grid place-items-center"
                 style={{ background: '#D5F2DC', color: '#15784A', fontSize: 17 }}>☕</div>
            <span className="absolute -top-0.5 -right-0.5 pulse-subtle"
                  style={{ color: 'var(--coral-ink)' }}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z"/>
              </svg>
            </span>
          </div>
          <span className="text-[14px] font-medium">Lily</span>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--moss)' }} />
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>online</span>
          <span className="text-[10px] font-mono uppercase tracking-wider ml-auto" style={{ color: 'var(--muted)' }}>2m</span>
        </div>
        <p className="text-[13.5px] leading-relaxed mb-2" style={{ color: 'var(--ink)' }}>
          actually — hold on. you got a sec? i used to work in HR before this coffee gig. want me to do a quick mock interview with you?
        </p>
        <div className="flex gap-1.5 mt-3">
          <span className="text-[11.5px] px-3 py-1.5 rounded-full font-medium"
                style={{ background: 'var(--coral)', color: '#fff' }}>
            Yeah, let's do it
          </span>
          <span className="text-[11.5px] px-3 py-1.5 rounded-full"
                style={{ border: '1px solid var(--hairline-strong)', color: 'var(--ink-2)' }}>
            Maybe later
          </span>
        </div>
      </div>
    </div>
  );
}

function Pill({ children }: { children?: any }) {
  return (
    <span className="text-[10.5px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full"
          style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--hairline)' }}>
      {children}
    </span>
  );
}

// ---------- Step 2: Profile ----------

const ROLES = ['Student', 'Software engineer', 'Designer', 'Marketer', 'Researcher', 'Something else'];
const GOALS = [
  { id: 'work',   label: 'Work',         zh: '工作' },
  { id: 'travel', label: 'Travel',       zh: '旅行' },
  { id: 'study',  label: 'Study abroad', zh: '留学' },
  { id: 'daily',  label: 'Daily life',   zh: '日常' },
];
const INTERESTS = ['Coffee', 'Movies', 'Tech', 'Sports', 'Cats', 'Cooking', 'Art', 'Gaming', 'Books', 'Music'];

function ProfileStep({ onNext, onBack }: { onNext: (data: any) => void; onBack: () => void }) {
  const [role, setRole] = useState('Software engineer');
  const [goal, setGoal] = useState('work');
  const [interests, setInterests] = useState(new Set(['Coffee', 'Cats', 'Tech']));

  const toggle = (i: string) => {
    const next = new Set(interests);
    if (next.has(i)) next.delete(i);
    else if (next.size < 5) next.add(i);
    setInterests(next);
  };

  return (
    <OnboardingShell step={1} onBack={onBack}>
      <div className="max-w-[1000px] mx-auto px-10 py-6 pb-20">
        <div className="fade-up">
          <h2 className="font-serif text-[52px] leading-[1.0]">Tell us about you.</h2>
          <p className="text-[14px] mt-2" style={{ color: 'var(--muted)' }}>
            我们想认识你 · your NPCs will reference this in conversation.
          </p>
        </div>

        <Question label="I am a…" hint="single select" mt={10}>
          <div className="flex flex-wrap gap-2">
            {ROLES.map(o => (
              <Pillbtn key={o} selected={role === o} onClick={() => setRole(o)}>{o}</Pillbtn>
            ))}
          </div>
        </Question>

        <Question label="I'm learning English for…" hint="single select" mt={8}>
          <div className="flex flex-wrap gap-2">
            {GOALS.map(o => (
              <Pillbtn key={o.id} selected={goal === o.id} onClick={() => setGoal(o.id)}>
                {o.label}<span className="ml-2 text-[10.5px] font-mono opacity-60">{o.zh}</span>
              </Pillbtn>
            ))}
          </div>
        </Question>

        <Question label="What I like…" hint={`pick 3 to 5 · ${interests.size} selected`} mt={8}>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map(o => (
              <Pillbtn key={o} selected={interests.has(o)} onClick={() => toggle(o)}>{o}</Pillbtn>
            ))}
          </div>
        </Question>

        {/* AI explainer */}
        <div className="mt-8 rounded-xl px-4 py-3.5 flex items-start gap-3 fade-up"
             style={{ background: 'var(--plum-soft)', border: '1px dashed oklch(0.78 0.05 300)' }}>
          <span style={{ color: 'var(--plum-ink)' }} className="mt-0.5">{WebI.sparkleF}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-mono uppercase tracking-wider" style={{ color: 'var(--plum-ink)' }}>
              How this gets used
            </div>
            <p className="text-[12.5px] mt-0.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              Your NPCs will remember these. If you pick <span style={{ color: 'var(--ink)' }} className="font-medium">Cats</span>, expect Emma to ask for cat pictures within the week. Pick <span style={{ color: 'var(--ink)' }} className="font-medium">Coffee</span> and Lily will recommend new drinks.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 flex items-center justify-between fade-up">
          <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            You can change this later
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onBack}
                    className="px-5 py-2.5 rounded-full text-[13px] transition hover:bg-[var(--bg-warm)]"
                    style={{ color: 'var(--ink-2)' }}>
              Back
            </button>
            <button onClick={() => onNext({ role, goal, interests: Array.from(interests) })}
                    disabled={interests.size < 3}
                    className="group inline-flex items-center gap-2 px-6 py-3 rounded-full text-[14px] font-medium transition disabled:opacity-40"
                    style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-ink)' }}>
              Continue
              <span className="transition group-hover:translate-x-1">{WebI.arrowR}</span>
            </button>
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}

function Question({ label, hint, children, mt = 6 }: { label: string; hint: string; children?: any; mt?: number }) {
  return (
    <div className="fade-up" style={{ marginTop: `${mt * 4}px`, animationDelay: '0.05s' }}>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Pillbtn({ selected, onClick, children }: { selected: boolean; onClick: () => void; children?: any }) {
  return (
    <button onClick={onClick}
            className="px-3.5 py-2 rounded-full text-[13px] transition flex items-center"
            style={{
              background: selected ? 'var(--accent)' : 'var(--surface)',
              color: selected ? '#fff' : 'var(--ink-2)',
              border: `1px solid ${selected ? 'var(--accent)' : 'var(--hairline)'}`,
            }}>
      {selected && <span className="mr-1.5" style={{ color: 'var(--coral)' }}>{WebI.checkF}</span>}
      {children}
    </button>
  );
}

// ---------- Step 3: Meet Lily ----------

function MeetStep({ onFinish, onBack, profileData }: { onFinish?: () => void; onBack: () => void; profileData: any }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleFinish() {
    if (!username.trim()) { setError('Please pick a username.'); return; }
    setBusy(true);
    setError('');
    try {
      const { role, goal, interests } = profileData || {};
      const goalStr = Array.isArray(goal) ? (goal[0] || null) : (goal || null);
      await finishOnboarding({ username: username.trim(), role: role || null, goal: goalStr, interests: interests || [], navigate });
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <OnboardingShell step={2} onBack={onBack}>
      <div className="max-w-[1100px] mx-auto px-10 py-4 pb-16">
        <div className="text-center fade-up">
          <span className="text-[10px] font-mono uppercase tracking-[0.22em]" style={{ color: 'var(--muted)' }}>
            Meet your first friend
          </span>
          <h2 className="font-serif text-[64px] leading-[1.0] mt-2">
            Say hi to <span style={{ color: 'var(--accent-ink)' }}>Lily.</span>
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-12 gap-8 items-start fade-up" style={{ animationDelay: '0.10s' }}>
          {/* Avatar block */}
          <div className="col-span-5">
            <div className="aspect-square rounded-3xl grid place-items-center overflow-hidden relative"
                 style={{ background: '#D5F2DC' }}>
              <span style={{ color: 'var(--coral-ink)', fontSize: 220, lineHeight: 1 }}>☕</span>
              {/* online indicator pinned */}
              <div className="absolute bottom-5 left-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                   style={{ background: 'var(--accent-strong)', color: '#fff' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#7BE0BC' }} />
                <span className="text-[10.5px] font-mono uppercase tracking-wider">Online</span>
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="col-span-7">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[28px] font-medium">Lily</span>
              <span style={{ color: 'var(--plum)' }}>{WebI.sparkleF}</span>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ml-1"
                    style={{ background: 'var(--plum-soft)', color: 'var(--plum-ink)' }}>
                AI · Persona
              </span>
            </div>
            <div className="text-[13px] font-mono mt-1" style={{ color: 'var(--muted)' }}>
              Coffee shop barista · Brooklyn · 24
            </div>

            <p className="text-[15px] mt-4 leading-relaxed max-w-[480px]" style={{ color: 'var(--ink-2)' }}>
              Lily is friendly, casual, and uses NYC slang. She knows a handful of Chinese words but
              mostly answers in English. She'll help you practice everyday conversation —
              ordering, small talk, weekend plans.
            </p>

            <div className="flex flex-wrap gap-1.5 mt-4">
              <Trait>Casual register</Trait>
              <Trait>Uses slang</Trait>
              <Trait>Topic: food · neighborhoods · daily life</Trait>
              <Trait>EN · occasional 中文</Trait>
            </div>

            {/* AI explainer */}
            <div className="mt-6 rounded-xl px-4 py-3 flex items-start gap-2.5"
                 style={{ background: 'var(--coral-soft)', border: '1px dashed oklch(0.86 0.07 45)' }}>
              <span style={{ color: 'var(--coral-ink)' }} className="mt-0.5">{WebI.sparkleF}</span>
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--coral-ink)' }}>
                As you two get to know each other, she may suggest practice scenarios from inside the chat —
                based on what you've been talking about. You can always decline.
              </p>
            </div>

            {/* Sample first message */}
            <div className="mt-7">
              <div className="text-[10px] font-mono uppercase tracking-wider mb-2"
                   style={{ color: 'var(--muted)' }}>
                Her first message · preview
              </div>
              <div className="flex items-end gap-2">
                <div className="w-9 h-9 rounded-full grid place-items-center"
                     style={{ background: '#D5F2DC', color: 'var(--coral-ink)' }}>☕</div>
                <div className="px-4 py-2.5 rounded-2xl rounded-bl-md max-w-[440px]"
                     style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
                  <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--ink)' }}>
                    hey! welcome in. you look new — what can i get started for you today?
                    we've got a really good oat milk latte if you want a rec ☕
                  </p>
                </div>
              </div>
            </div>

            {/* Username input */}
            <div className="mt-7">
              <label className="text-[12px] font-mono uppercase tracking-wider block mb-2"
                     style={{ color: 'var(--muted)' }}>
                Pick a username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFinish()}
                placeholder="e.g. alex123"
                className="w-full px-4 py-2.5 rounded-xl text-[14px] outline-none"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  color: 'var(--ink)',
                }}
                disabled={busy}
              />
              {error && (
                <p className="mt-2 text-[12px]" style={{ color: 'var(--coral-ink)' }}>{error}</p>
              )}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 flex items-center justify-between fade-up" style={{ animationDelay: '0.16s' }}>
          <div className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
            Up next → Mr. Chen and Emma will appear as your conversations grow.
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onBack} disabled={busy}
                    className="px-5 py-2.5 rounded-full text-[13px] transition hover:bg-[var(--bg-warm)]"
                    style={{ color: 'var(--ink-2)' }}>
              Back
            </button>
            <button onClick={handleFinish} disabled={busy || !username.trim()}
                    className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[15px] font-medium transition disabled:opacity-40"
                    style={{ background: 'var(--coral)', color: '#fff' }}>
              {busy ? 'Setting up…' : 'Start chatting'}
              {!busy && <span className="transition group-hover:translate-x-1">{WebI.arrowR}</span>}
            </button>
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}

async function finishOnboarding({ username, role, goal, interests, navigate }: { username: string; role: string | null; goal: string | null; interests: string[]; navigate: (path: string) => void }) {
  try {
    await api.register(username, username);
  } catch (e: any) {
    if (e.status === 409) {
      await api.login(username, username);
    } else {
      throw e;
    }
  }
  await api.saveProfile({ role: role || null, goal: goal || null, interests: interests || [] });
  await api.onboardingComplete();
  navigate('/');
}

function Trait({ children }: { children?: any }) {
  return (
    <span className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-1 rounded"
          style={{ background: 'var(--bg-warm)', color: 'var(--ink-2)' }}>
      {children}
    </span>
  );
}

// ---------- Login form (returning users) ----------

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleLogin() {
    if (!username.trim()) { setError('Enter your username.'); return; }
    setBusy(true);
    setError('');
    try {
      await api.login(username.trim(), password);
      navigate('/');
    } catch (e: any) {
      setError(e.message || 'Login failed.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl px-6 py-5 max-w-[420px] mx-auto"
         style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="text-[11px] font-mono uppercase tracking-wider mb-4" style={{ color: 'var(--muted)' }}>
        Already have an account? Log in
      </div>
      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full px-4 py-2.5 rounded-xl text-[14px] outline-none"
          style={{ background: 'var(--bg)', border: '1px solid var(--hairline)', color: 'var(--ink)' }}
          disabled={busy}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-4 py-2.5 rounded-xl text-[14px] outline-none"
          style={{ background: 'var(--bg)', border: '1px solid var(--hairline)', color: 'var(--ink)' }}
          disabled={busy}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
        />
        {error && <p className="text-[12px]" style={{ color: 'var(--coral-ink)' }}>{error}</p>}
        <button onClick={handleLogin} disabled={busy}
                className="w-full py-2.5 rounded-xl text-[14px] font-medium transition disabled:opacity-40"
                style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-ink)' }}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// YOUR JOURNEY — wide dashboard
// ============================================================

// NPC glyph/colour lookup for rendering relationship cards from live API data
const NPC_VISUAL: Record<string, { glyph: string; bg: string; ink: string }> = {
  lily:  { glyph: '☕', bg: '#D5F2DC',                      ink: '#15784A' },
  chen:  { glyph: '陈', bg: 'oklch(0.93 0.02 250)',          ink: 'oklch(0.40 0.06 250)' },
  emma:  { glyph: 'E',  bg: 'oklch(0.93 0.04 340)',          ink: 'oklch(0.48 0.10 340)' },
};

function JourneyDashboard() {
  const [journey, setJourney] = useState<JourneySummaryResponse | null>(null);
  const [rels, setRels] = useState<RelationshipCard[]>([]);
  const [achs, setAchs] = useState<Achievement[]>([]);

  useEffect(() => {
    Promise.all([api.journey(), api.relationships(), api.achievements()])
      .then(([j, r, a]) => { setJourney(j); setRels(r); setAchs(a); })
      .catch(() => {});
  }, []);

  const days          = journey ? journey.days          : '—';
  const conversations = journey ? journey.conversations : '—';
  const scenarios     = journey ? journey.scenarios     : '—';
  const memories      = journey ? journey.memories      : '—';
  const friendCount   = rels.length || 3;

  return (
    <div className="app-shell" data-screen-label="04 Web · Your Journey">
      <WebNavRail activeTop="journey" />

      <section className="pane-main overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div className="max-w-[1100px] mx-auto px-10 py-8">
          {/* Header */}
          <div className="fade-up">
            <span className="text-[10px] font-mono uppercase tracking-[0.22em]" style={{ color: 'var(--muted)' }}>
              your journey · 你的旅程
            </span>
            <div className="flex items-end justify-between gap-8 mt-2 flex-wrap">
              <h1 className="font-serif text-[58px] leading-[0.95]">
                {days} days,<br /><span style={{ color: 'var(--accent-ink)' }}>{friendCount} friendships.</span>
              </h1>
              <div className="grid grid-cols-4 gap-2 min-w-[460px]">
                <StatBox label="days"          value={String(days)} />
                <StatBox label="conversations" value={String(conversations)} />
                <StatBox label="scenarios"     value={String(scenarios)} />
                <StatBox label="memories"      value={String(memories)} plum />
              </div>
            </div>
          </div>

          {/* Relationships */}
          <Section eyebrow="Relationships" zh="关系"
                   title="People you talk to" mt={12}>
            <div className="grid grid-cols-3 gap-3">
              {rels.length > 0
                ? rels.map((r) => <LiveRelationshipCard key={r.npcId} r={r} />)
                : <p className="text-[13px] col-span-3" style={{ color: 'var(--muted)' }}>Loading…</p>
              }
            </div>
          </Section>

          {/* Achievements */}
          <Section eyebrow="Achievements" zh="成就"
                   title="What you've unlocked" mt={12}>
            <div className="grid grid-cols-2 gap-3">
              {achs.length > 0
                ? achs.map((a) => <AchievementCard key={a.id} a={a} />)
                : <p className="text-[13px] col-span-2" style={{ color: 'var(--muted)' }}>Loading…</p>
              }
            </div>
          </Section>

          {/* Engine footer */}
          <div className="mt-12 pt-5 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider"
               style={{ borderTop: '1px solid var(--hairline)', color: 'var(--muted)' }}>
            <span>memories generated by qwen3.5:9b · local</span>
            <span>all observations on this device</span>
          </div>
        </div>
      </section>

      <WebDock current="03 Onboarding & Journey" />
    </div>
  );
}

function LiveRelationshipCard({ r }: { r: RelationshipCard }) {
  const visual = NPC_VISUAL[r.npcId] || { glyph: r.name ? r.name[0] : '?', bg: 'var(--surface-2)', ink: 'var(--ink)' };
  const stageLabel = RELATIONSHIP_LABEL[r.stage] || r.stage || '—';
  const stageValue = r.stageValue != null ? r.stageValue
                   : r.stage === 'close' ? 3 : r.stage === 'friend' ? 2 : 1;
  const sub  = r.sub  || '';
  const note = r.note || '';
  const last = r.last || '';

  return (
    <div className="rounded-xl p-4"
         style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="flex items-start gap-3 mb-2">
        <div className="w-12 h-12 rounded-full grid place-items-center shrink-0"
             style={{ background: visual.bg, color: visual.ink, fontSize: 22,
                      fontFamily: /[一-龥]/.test(visual.glyph) ? "'Outfit', sans-serif" : 'inherit' }}>
          {visual.glyph}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-medium truncate">{r.name}</span>
            {last && <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{last}</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <WebRelationshipDots value={stageValue} />
            <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{stageLabel}</span>
          </div>
        </div>
      </div>
      {sub && <div className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>{sub}</div>}
      {note && (
        <p className="text-[12px] mt-2 leading-snug" style={{ color: 'var(--ink-2)' }}>
          {note}
        </p>
      )}
    </div>
  );
}

function AchievementCard({ a }: { a: Achievement }) {
  return (
    <div className="rounded-xl p-4 flex items-start gap-3"
         style={{
           background: 'var(--surface)',
           border: '1px solid ' + (a.unlocked ? 'var(--hairline)' : 'var(--hairline)'),
           opacity: a.unlocked ? 1 : 0.5,
         }}>
      <div className="text-[28px] shrink-0" style={{ lineHeight: 1 }}>
        {a.icon || '🏆'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium" style={{ color: 'var(--ink)' }}>{a.title}</div>
        <p className="text-[12px] mt-0.5 leading-snug" style={{ color: 'var(--ink-2)' }}>{a.description}</p>
        {a.unlocked && a.unlockedAt && (
          <div className="text-[10px] font-mono mt-1.5" style={{ color: 'var(--muted)' }}>
            Unlocked {new Date(a.unlockedAt).toLocaleDateString()}
          </div>
        )}
        {!a.unlocked && (
          <div className="text-[10px] font-mono mt-1.5" style={{ color: 'var(--muted)' }}>Locked</div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, plum }: { label: string; value: string; plum?: boolean }) {
  return (
    <div className="rounded-xl px-4 py-3"
         style={{ background: 'var(--surface)', border: '1px solid ' + (plum ? 'oklch(0.86 0.045 300)' : 'var(--hairline)') }}>
      <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className="font-serif text-[28px] mt-0.5" style={{ color: 'var(--ink)', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function Section({ eyebrow, zh, title, desc, children, mt = 8, plum }: { eyebrow: string; zh: string; title: string; desc?: string; children?: any; mt?: number; plum?: boolean }) {
  return (
    <section className="fade-up" style={{ marginTop: `${mt * 4}px` }}>
      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em]"
                  style={{ color: plum ? 'var(--plum-ink)' : 'var(--muted)' }}>
              {eyebrow}
            </span>
            <span className="text-[10.5px]" style={{ color: 'var(--muted)' }}>· {zh}</span>
          </div>
          <h2 className="font-serif text-[26px] leading-tight">{title}</h2>
          {desc && <p className="text-[12.5px] mt-1.5 max-w-[640px]" style={{ color: 'var(--muted)' }}>{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

// ============================================================
// APP
// ============================================================

export default function Onboarding() {
  // 'loading' | 'wizard' | 'journey'
  const [appView, setAppView] = useState('loading');
  const [step, setStep] = useState(0);
  const [profileData, setProfileData] = useState({ role: 'Software engineer', goal: 'work', interests: ['Coffee', 'Cats', 'Tech'] });

  useEffect(() => {
    api.me()
      .then(() => setAppView('journey'))
      .catch(() => setAppView('wizard'));
  }, []);

  if (appView === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <span className="text-[13px] font-mono" style={{ color: 'var(--muted)' }}>Loading…</span>
      </div>
    );
  }

  if (appView === 'journey') {
    return (
      <div className="min-h-screen">
        <JourneyDashboard />
        <WebDock current="03 Onboarding & Journey" />
      </div>
    );
  }

  // Wizard view
  return (
    <div className="min-h-screen">
      {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
      {step === 1 && (
        <ProfileStep
          onNext={(data) => { setProfileData(data); setStep(2); }}
          onBack={() => setStep(0)}
        />
      )}
      {step === 2 && (
        <MeetStep
          profileData={profileData}
          onBack={() => setStep(1)}
        />
      )}
      {step === 0 && <LoginForm />}
      <WebDock current="03 Onboarding & Journey" />
    </div>
  );
}
