// Popcorn Language — Web Onboarding + Your Journey
// Onboarding is full-bleed (no app shell). Journey uses the 3-pane shell.

const { useState } = React;

// ============================================================
// ONBOARDING — full-bleed, 3 steps
// ============================================================

function OnboardingShell({ step, totalSteps = 3, onBack, children }) {
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
          <button className="text-[11.5px] transition hover:text-[var(--ink)]"
                  style={{ color: 'var(--muted)' }}>
            Already have an account? <span className="underline underline-offset-2">Sign in</span>
          </button>
        </div>
      </header>

      <main className="relative z-10">{children}</main>
    </div>
  );
}

function StepDots({ step, total }) {
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

function WelcomeStep({ onNext }) {
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
            <Pill>Local-first · qwen2.5:7b</Pill>
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

function Pill({ children }) {
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

function ProfileStep({ onNext, onBack }) {
  const [role, setRole] = useState('Software engineer');
  const [goal, setGoal] = useState('work');
  const [interests, setInterests] = useState(new Set(['Coffee', 'Cats', 'Tech']));

  const toggle = (i) => {
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
            <button onClick={onNext} disabled={interests.size < 3}
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

function Question({ label, hint, children, mt = 6 }) {
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

function Pillbtn({ selected, onClick, children }) {
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

function MeetStep({ onNext, onBack }) {
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
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 flex items-center justify-between fade-up" style={{ animationDelay: '0.16s' }}>
          <div className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
            Up next → Mr. Chen and Emma will appear as your conversations grow.
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onBack}
                    className="px-5 py-2.5 rounded-full text-[13px] transition hover:bg-[var(--bg-warm)]"
                    style={{ color: 'var(--ink-2)' }}>
              Back
            </button>
            <button onClick={onNext}
                    className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[15px] font-medium transition"
                    style={{ background: 'var(--coral)', color: '#fff' }}>
              Start chatting
              <span className="transition group-hover:translate-x-1">{WebI.arrowR}</span>
            </button>
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}

function Trait({ children }) {
  return (
    <span className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-1 rounded"
          style={{ background: 'var(--bg-warm)', color: 'var(--ink-2)' }}>
      {children}
    </span>
  );
}

// ============================================================
// YOUR JOURNEY — wide dashboard
// ============================================================

const RELATIONSHIPS = [
  { id: 'lily', name: 'Lily', glyph: '☕',
    bg: '#D5F2DC', ink: '#15784A',
    stage: 'Close friend', stageValue: 3,
    sub: '8 conversations · 2 scenarios',
    note: 'Invited you to Mock Interview yesterday',
    last: 'today, 9:08' },
  { id: 'chen', name: 'Mr. Chen', glyph: '陈',
    bg: 'oklch(0.93 0.02 250)', ink: 'oklch(0.40 0.06 250)',
    stage: 'Acquaintance', stageValue: 1,
    sub: '3 conversations · 1 declined',
    note: 'Asked about the rollout plan',
    last: '1d ago' },
  { id: 'emma', name: 'Emma', glyph: 'E',
    bg: 'oklch(0.93 0.04 340)', ink: 'oklch(0.48 0.10 340)',
    stage: 'Friend', stageValue: 2,
    sub: '5 conversations',
    note: 'Constantly wants cat pictures',
    last: '5h ago' },
];

const SCENARIOS = [
  { name: 'Mock Interview', npc: 'Lily', outcome: 'completed', result: 'B+', when: 'Yesterday', tags: ['Formal register', 'Polite hedging'] },
  { name: 'Coffee Order — busy hours', npc: 'Lily', outcome: 'completed', result: 'A−', when: 'May 12', tags: ['Casual register', 'Time pressure'] },
  { name: 'Apartment Dispute', npc: 'Mr. Chen', outcome: 'declined', when: 'Last week' },
  { name: 'Late to a meeting', npc: 'Mr. Chen', outcome: 'in-progress', when: 'Earlier today', tags: ['Apologetic register'] },
];

const MEMORIES = [
  { title: 'Cat Person Diplomat',
    body: "You've talked about your cat in 5 different conversations — with all three NPCs. Pattern detected: you bring up cats when you want to change the subject.",
    when: 'noticed Tuesday' },
  { title: 'Coffee Order Expert',
    body: "You've successfully ordered coffee in three different scenarios — casual, polite, even apologetic when you were late. Register flexibility under low-stakes.",
    when: 'noticed last week' },
  { title: 'Polite Disagree-er',
    body: 'You handled disagreement gracefully — you used "I see what you mean, but…" twice last week. That phrasing is a keeper.',
    when: 'noticed yesterday' },
  { title: 'Tense-Switcher',
    body: "When you talk about things that haven't happened yet, you sometimes drop into present tense (\"tomorrow I go\"). You self-correct about 60% of the time now — up from 20% last month.",
    when: 'noticed today' },
];

function JourneyDashboard() {
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
                17 days,<br /><span style={{ color: 'var(--accent-ink)' }}>3 friendships.</span>
              </h1>
              <div className="grid grid-cols-4 gap-2 min-w-[460px]">
                <StatBox label="days"          value="17" />
                <StatBox label="conversations" value="86" />
                <StatBox label="scenarios"     value="4"  />
                <StatBox label="memories"      value="4"  plum />
              </div>
            </div>
          </div>

          {/* Relationships */}
          <Section eyebrow="Relationships" zh="关系"
                   title="People you talk to" mt={12}>
            <div className="grid grid-cols-3 gap-3">
              {RELATIONSHIPS.map(r => <RelationshipCard key={r.id} r={r} />)}
            </div>
          </Section>

          {/* Scenarios */}
          <Section eyebrow="Scenarios" zh="情景"
                   title="What you've practiced" mt={12}>
            <div className="grid grid-cols-2 gap-3">
              {SCENARIOS.map((s, i) => <ScenarioCard key={i} s={s} />)}
            </div>
          </Section>

          {/* Memories */}
          <Section eyebrow="Memories" zh="为你生成"
                   title="What your AI noticed about how you talk" mt={12}
                   plum
                   desc="Observations your local LLM made by looking at your conversations. Different for every learner — these are yours alone.">
            <div className="grid grid-cols-2 gap-3">
              {MEMORIES.map((m, i) => <MemoryCard key={i} m={m} />)}
            </div>
          </Section>

          {/* Engine footer */}
          <div className="mt-12 pt-5 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider"
               style={{ borderTop: '1px solid var(--hairline)', color: 'var(--muted)' }}>
            <span>memories generated by qwen2.5:7b · local</span>
            <span>all observations on this device</span>
          </div>
        </div>
      </section>

    </div>
  );
}

function StatBox({ label, value, plum }) {
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

function Section({ eyebrow, zh, title, desc, children, mt = 8, plum }) {
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

function RelationshipCard({ r }) {
  return (
    <div className="rounded-xl p-4"
         style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="flex items-start gap-3 mb-2">
        <div className="w-12 h-12 rounded-full grid place-items-center shrink-0"
             style={{ background: r.bg, color: r.ink, fontSize: 22,
                      fontFamily: /[\u4e00-\u9fa5]/.test(r.glyph) ? "'Outfit', sans-serif" : 'inherit' }}>
          {r.glyph}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-medium truncate">{r.name}</span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{r.last}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <WebRelationshipDots value={r.stageValue} />
            <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{r.stage}</span>
          </div>
        </div>
      </div>
      <div className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>{r.sub}</div>
      {r.note && (
        <p className="text-[12px] mt-2 leading-snug" style={{ color: 'var(--ink-2)' }}>
          {r.note}
        </p>
      )}
    </div>
  );
}

function ScenarioCard({ s }) {
  const status = s.outcome === 'completed' ? { label: '✓ completed', color: 'var(--moss)', bg: 'var(--moss-soft)' }
              : s.outcome === 'declined'   ? { label: '⤴ declined',   color: 'var(--muted)', bg: 'var(--bg-warm)' }
              :                              { label: '🕐 in progress', color: 'var(--coral-ink)', bg: 'var(--coral-soft)' };
  return (
    <div className="rounded-xl p-4 flex items-start gap-4"
         style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium" style={{ color: 'var(--ink)' }}>
          {s.name}
        </div>
        <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
          with {s.npc} · {s.when}
        </div>
        {s.tags && (
          <div className="flex flex-wrap gap-1 mt-2">
            {s.tags.map(t => (
              <span key={t} className="text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--bg-warm)', color: 'var(--ink-2)' }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      {s.result && (
        <span className="font-serif text-[26px] shrink-0" style={{ color: 'var(--coral-ink)', lineHeight: 1 }}>
          {s.result}
        </span>
      )}
      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded shrink-0"
            style={{ background: status.bg, color: status.color }}>
        {status.label}
      </span>
    </div>
  );
}

function MemoryCard({ m }) {
  return (
    <div className="ai-border rounded-xl p-4 relative">
      <div className="flex items-center gap-1.5 mb-2">
        <span style={{ color: 'var(--plum)' }}>{WebI.sparkleF}</span>
        <span className="text-[9.5px] font-mono uppercase tracking-wider" style={{ color: 'var(--plum-ink)' }}>
          AI · observed
        </span>
        <span className="text-[9.5px] font-mono uppercase tracking-wider ml-auto" style={{ color: 'var(--muted)' }}>
          {m.when}
        </span>
      </div>
      <div className="font-serif text-[22px] leading-tight" style={{ color: 'var(--ink)', fontWeight: 700 }}>
        {m.title}
      </div>
      <p className="text-[12.5px] mt-2 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        {m.body}
      </p>
    </div>
  );
}

// ============================================================
// APP
// ============================================================

function App() {
  const initialView = window.location.hash === '#journey' ? 'journey' : 'onboarding';
  const [view, setView] = useState(initialView);
  const [step, setStep] = useState(0);

  return (
    <div className="min-h-screen">
      {/* Top section toggle */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 p-1 rounded-full"
           style={{ background: 'oklch(0.18 0.01 55 / 0.92)', backdropFilter: 'blur(8px)' }}>
        <span className="px-2 text-[9.5px] font-mono uppercase tracking-[0.18em]"
              style={{ color: 'oklch(0.62 0.03 55)' }}>Screens</span>
        {[
          { id: 'onboarding', label: view === 'onboarding' ? `Onboarding · 0${step+1}/03` : 'Onboarding' },
          { id: 'journey',    label: 'Your Journey' },
        ].map(t => (
          <button key={t.id} onClick={() => setView(t.id)}
                  className="px-3 py-1.5 rounded-full text-[10.5px] font-mono uppercase tracking-wider transition"
                  style={{
                    background: view === t.id ? '#fff' : 'transparent',
                    color: view === t.id ? '#1F1B16' : 'oklch(0.78 0.02 60)',
                  }}>
            {t.label}
          </button>
        ))}
      </div>

      {view === 'onboarding' && step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
      {view === 'onboarding' && step === 1 && <ProfileStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
      {view === 'onboarding' && step === 2 && <MeetStep    onNext={() => window.location.assign('Web%20-%20Main%20App.html')} onBack={() => setStep(1)} />}
      {view === 'journey'    && <JourneyDashboard />}

      <WebDock current={view === 'journey' ? '04 Journey' : '01 Onboarding'} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
