// Popcorn Language — Web Scenario (Emergent Mode)
// 4 states (A/B/C/D) of the same chat with Lily, in the web 3-pane shell.

const { useState, useEffect, useRef } = React;

// ---------- Threads ----------

const THREAD_A_WEB = [
  { from: 'npc',  text: "hey ☕ what'd you have for breakfast?", time: '08:41' },
  { from: 'user', text: "Just coffee. Today my stomach is nervous.", time: '08:42',
    correction: { fixed: "My stomach is nervous today.", noteZh: "时间状语 today 通常放句首或句尾，放句中显得生硬。", tag: 'Style · Word order' } },
  { from: 'npc',  text: "oh no — are you ok?", time: '08:42' },
  { from: 'user', text: "I have a job interview tomorrow. First one in English.", time: '08:43' },
  { from: 'npc',  text: "ohhh that's huge. what's the role??", time: '08:43' },
  { from: 'user', text: "Junior marketing at a small agency in Manhattan.", time: '08:44' },
  { from: 'npc',  text: "ok ok i love that. you'll do great — you've gotten so much better at this btw, i noticed 🥹", time: '08:45', isLatest: true },
];

const THREAD_B_WEB = [
  ...THREAD_A_WEB.slice(0, -1),
  { from: 'npc', text: "ok ok i love that. you'll do great — you've gotten so much better at this btw, i noticed 🥹", time: '08:45' },
  { from: 'npc-invitation', time: '08:46', isLatest: true,
    text: "actually — hold on. you got a sec?",
    detail: "i used to work in HR before this coffee gig (long story). want me to do a quick mock interview with you right now? i'll play a tough HR manager, you just answer like you would tomorrow. low stakes, just us 😊",
    note: "Lily is suggesting a practice scenario based on what you two have been talking about.",
  },
];

const LINDA_MESSAGES = [
  { from: 'npc-c', text: "Thanks for coming in. Let's start with the obvious — walk me through your last project.", time: '08:48' },
  { from: 'user',  text: "Last quarter I led the redesign of our customer onboarding flow. It reduced first-week drop-off by about 14 percent.", time: '08:50' },
  { from: 'npc-c', text: "Impressive number. And tell me about a weakness of yours — and I don't want the rehearsed answer about being a perfectionist.", time: '08:51', isLatest: true },
];

const THREAD_D_WEB = [
  { from: 'system', text: "Mock interview ended · 8 minutes · 6 exchanges" },
  { from: 'summary' },
  { from: 'npc', text: "phew you did SO well i'm proud of you 🥹", time: '08:56' },
  { from: 'npc', text: "want to grab a real coffee now? or are you off to study? ☕", time: '08:57', isLatest: true },
];

const CHOICES = [
  { text: "Honestly, I tend to over-prepare. I'll spend extra hours on something even when the brief calls for something rougher.",
    tone: 'Diplomatic', desc: 'acknowledges, reframes as growth' },
  { text: "I don't really see myself as having weaknesses — I focus on what I'm strong at.",
    tone: 'Confident', desc: 'dodges the question — risky' },
  { text: "Could I think about that for a second? It's a fair question and I'd rather give you a real answer than a rehearsed one.",
    tone: 'Reflective', desc: 'asks for pause, signals authenticity' },
];

// ---------- Chat header ----------

function ScenChatHeader({ intense }) {
  const npc = NPCS_WEB[0]; // Lily
  return (
    <header className="px-6 py-3.5 flex items-center justify-between chat-bg"
            style={{
              borderBottom: intense ? '1px solid var(--hairline-c)' : '1px solid var(--hairline)',
              background: intense ? 'var(--surface-2c)' : 'var(--surface-2)',
            }}>
      <div className="flex items-center gap-3">
        <WebAvatar npc={npc} size={38} />
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-medium">
              {intense ? <>Lily <span className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>as</span> Linda</> : 'Lily'}
            </span>
            <span style={{ color: 'var(--plum)' }}>
              <svg viewBox="0 0 24 24" className="w-3 h-3 ai-dot" fill="currentColor">
                <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z"/>
              </svg>
            </span>
            {intense && (
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ml-1"
                    style={{ background: 'oklch(0.92 0.05 150)', color: 'var(--accent-ink)' }}>
                Roleplay · HR Manager
              </span>
            )}
          </div>
          <div className="text-[11px] mt-0.5"
               style={{ color: intense ? 'var(--coral-ink)' : 'var(--muted)' }}>
            {intense ? 'Active scenario · Round 1 · 5 of 6 turns left' : npc.status}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {intense ? (
          <button className="px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider transition"
                  style={{ background: 'var(--surface)', border: '1px solid var(--hairline-strong)', color: 'var(--coral-ink)' }}>
            <span className="inline-flex items-center gap-1.5">{WebI.pause} Pause roleplay</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
               style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
            <WebRelationshipDots value={npc.stageValue} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {RELATIONSHIP_LABEL[npc.relationship]}
            </span>
          </div>
        )}
        <button className="w-9 h-9 rounded-full grid place-items-center hover:bg-[var(--bg-warm)] transition"
                style={{ color: 'var(--muted)' }}>
          {WebI.more}
        </button>
      </div>
    </header>
  );
}

// ---------- Scenario HUD ----------

function ScenarioHUD() {
  return (
    <div className="px-6 py-2.5 flex items-center justify-between gap-3 fade-up"
         style={{ background: 'var(--surface-2c)', borderBottom: '1px solid var(--hairline-c)' }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-4 h-4" style={{ color: 'var(--coral-ink)' }}>{WebI.bldg}</span>
        <span className="text-[11px] font-mono uppercase tracking-[0.16em]" style={{ color: 'var(--coral-ink)' }}>
          Job Interview · Round 1
        </span>
        <span className="text-[10.5px]" style={{ color: 'var(--muted)' }}>
          · objective: hold composure under tough HR questions
        </span>
      </div>
      <div className="flex items-center gap-5">
        <HUDMeter label="Impression" filled={6} total={10} />
        <HUDStress level="Medium" />
      </div>
    </div>
  );
}

function HUDMeter({ label, filled, total }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9.5px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="inline-flex gap-[2px]">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className="block"
                style={{
                  width: 7, height: 7,
                  background: i < filled ? 'var(--coral-strong)' : 'oklch(0.88 0.02 60)',
                  borderRadius: 1.5,
                }} />
        ))}
      </span>
      <span className="text-[10.5px] font-mono" style={{ color: 'var(--ink-2)' }}>{filled}/{total}</span>
    </div>
  );
}

function HUDStress({ level }) {
  const color = level === 'Low' ? 'var(--moss)' : level === 'Medium' ? 'oklch(0.65 0.13 70)' : 'oklch(0.60 0.16 30)';
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9.5px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Stress</span>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[10.5px] font-mono" style={{ color: 'var(--ink-2)' }}>{level}</span>
    </div>
  );
}

// ---------- Day divider ----------
function DayDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
      <span className="text-[9.5px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
    </div>
  );
}

// ---------- Message bubbles ----------
function ScenMessage({ msg, intense, onAcceptScenario, onDeclineScenario }) {
  if (msg.from === 'system') {
    return (
      <div className="text-center my-3 fade-up">
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] px-2.5 py-1 rounded-full"
              style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--hairline)' }}>
          {msg.text}
        </span>
      </div>
    );
  }
  if (msg.from === 'summary') return <ScenarioSummaryCard />;
  if (msg.from === 'npc-invitation') return <InvitationCard msg={msg} onAccept={onAcceptScenario} onDecline={onDeclineScenario} />;

  const isUser = msg.from === 'user';
  const isLinda = msg.from === 'npc-c';
  const npc = NPCS_WEB[0];

  return (
    <div className={`flex items-end gap-2 mb-2.5 fade-up ${isUser ? 'justify-end' : ''}`}>
      {!isUser && <WebAvatar npc={npc} size={26} />}
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[68%]`}>
        <div className="px-3.5 py-2.5 text-[14px] leading-relaxed"
             style={isUser
               ? { background: 'var(--bubble-sent)', color: 'var(--bubble-sent-ink)', borderRadius: '16px 16px 4px 16px', boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)' }
               : isLinda
               ? { background: '#F1ECE0', color: '#3A3120',
                   border: '1px solid #DDD3BD', borderRadius: '16px 16px 16px 4px', boxShadow: '0 1px 0.5px rgba(11,20,26,0.08)' }
               : { background: 'var(--bubble-received)', color: 'var(--bubble-received-ink)', border: '1px solid var(--hairline)', borderRadius: '16px 16px 16px 4px', boxShadow: '0 1px 0.5px rgba(11,20,26,0.08)' }}>
          {msg.text}
        </div>
        <div className={`flex items-center gap-1.5 mt-1 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{msg.time}</span>
          {msg.correction && (
            <span className="inline-flex items-center gap-1 text-[10.5px]" style={{ color: 'var(--coral-ink)' }}>
              <span className="w-3 h-3">{WebI.pencil}</span>
              Lily noticed something
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Invitation card ----------
function InvitationCard({ msg, onAccept, onDecline }) {
  const npc = NPCS_WEB[0];
  return (
    <div className="flex items-start gap-2 mb-3 fade-up">
      <WebAvatar npc={npc} size={26} />
      <div className="flex-1 min-w-0 max-w-[560px]">
        <div className="px-3.5 py-2.5 text-[14px] leading-relaxed inline-block"
             style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline)',
                      borderRadius: '16px 16px 16px 4px' }}>
          {msg.text}
        </div>
        <div className="mt-2.5 rounded-2xl rounded-tl-md p-4 fade-up"
             style={{
               background: 'var(--surface)',
               border: '1px solid var(--coral)',
               boxShadow: '0 1px 0 oklch(1 0 0 / 0.5) inset, 0 6px 18px -8px oklch(0.66 0.12 38 / 0.30)',
             }}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-7 h-7 rounded-full grid place-items-center"
                  style={{ background: 'var(--coral-soft)' }}>☕</span>
            <span className="text-[11px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--coral-ink)' }}>
              Lily is suggesting · 一起练习
            </span>
          </div>
          <p className="text-[14px] leading-relaxed mb-3.5" style={{ color: 'var(--ink)' }}>
            {msg.detail}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onAccept}
                    className="rounded-full px-5 py-2.5 text-[13px] font-medium transition"
                    style={{ background: 'var(--coral)', color: '#fff', boxShadow: '0 1px 0 oklch(1 0 0 / 0.3) inset' }}>
              Yeah, let's do it
            </button>
            <button onClick={onDecline}
                    className="rounded-full px-4 py-2 text-[12.5px] transition hover:bg-[var(--bg-warm)]"
                    style={{ color: 'var(--ink-2)', border: '1px solid var(--hairline-strong)' }}>
              Maybe later
            </button>
            <span className="text-[10.5px] ml-auto" style={{ color: 'var(--muted)' }}>
              · ~8 min · roleplay
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{msg.time}</span>
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>· {msg.note}</span>
        </div>
      </div>
    </div>
  );
}

// ---------- Summary card ----------
function ScenarioSummaryCard() {
  return (
    <div className="my-3 rounded-2xl p-5 fade-up"
         style={{ background: 'var(--surface)', border: '1px solid var(--hairline-2)',
                  boxShadow: '0 4px 12px -6px oklch(0.18 0.02 60 / 0.10)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl grid place-items-center"
                style={{ background: 'var(--coral-soft)', color: 'var(--coral-ink)' }}>
            {WebI.bldg}
          </span>
          <div className="leading-tight">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
              Mock interview · complete
            </div>
            <div className="text-[16px] font-medium mt-0.5" style={{ color: 'var(--ink)' }}>
              Good performance — B+
            </div>
          </div>
        </div>
        <span className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-1 rounded"
              style={{ background: 'var(--moss-soft)', color: 'var(--moss)' }}>
          ✓ saved to journey
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryBlock icon="🗣️" label="Language">
          You used polite hedging well. Watch the slight overuse of <em>"I think"</em>.
        </SummaryBlock>
        <SummaryBlock icon="🧠" label="Pragmatics">
          You acknowledged the weakness and reframed as growth. The move HR was testing for.
        </SummaryBlock>
        <SummaryBlock icon="❤️" label="Relationship">
          <span style={{ color: 'var(--ink)' }}>Lily was impressed.</span> She'll tease you about it later.
        </SummaryBlock>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3"
           style={{ borderTop: '1px dashed var(--hairline-2)' }}>
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          ✨ AI · qwen2.5:7b · local
        </span>
        <a href="Web - Onboarding and Journey.html#journey"
           className="text-[11px] font-mono uppercase tracking-wider transition no-underline"
           style={{ color: 'var(--coral-ink)' }}>
          View in Journey →
        </a>
      </div>
    </div>
  );
}

function SummaryBlock({ icon, label, children }) {
  return (
    <div className="rounded-lg px-3 py-2.5"
         style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[13px]">{icon}</span>
        <span className="text-[9.5px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          {label}
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        {children}
      </p>
    </div>
  );
}

// ---------- Composers ----------

function CasualComposer({ state }) {
  const [draft, setDraft] = useState('');
  const chips = state === 'a' ? ['Tell me more', "I'm nervous", '什么意思?']
              : state === 'b' ? ['Yeah, sure', 'Why HR though?', 'Tell me more']
              : ['Thanks ❤️', 'I want a real coffee', "What's your name irl 😅"];
  return (
    <div className="px-6 pb-4 pt-3">
      <div className="max-w-[820px] mx-auto">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[10px] font-mono uppercase tracking-wider shrink-0" style={{ color: 'var(--muted)' }}>
            ✨ Suggest
          </span>
          {chips.map(c => (
            <button key={c} onClick={() => setDraft(c)}
                    className="shrink-0 px-3 py-1.5 rounded-full text-[12.5px] transition hover:bg-[var(--surface)]"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 rounded-2xl p-2 pl-3"
             style={{ background: 'var(--surface)', border: '1px solid var(--hairline-2)' }}>
          <button className="w-9 h-9 rounded-full grid place-items-center hover:bg-[var(--bg-warm)] transition"
                  style={{ color: 'var(--muted)' }}>{WebI.plus}</button>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1}
                    placeholder="Type in English or 中文…"
                    className="flex-1 resize-none bg-transparent outline-none py-2 text-[14px] placeholder:text-[var(--muted)]"
                    style={{ minHeight: 24, maxHeight: 120 }} />
          <button disabled={!draft.trim()}
                  className="h-9 px-4 rounded-full flex items-center gap-1.5 text-[13px] font-medium transition disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#fff' }}>
            Send <span className="w-4 h-4">{WebI.send}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ChoiceComposer({ onComplete }) {
  return (
    <div className="px-6 pb-4 pt-3" style={{ background: 'linear-gradient(180deg, transparent, var(--bg-warm-c) 40%)' }}>
      <div className="max-w-[820px] mx-auto">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10.5px] font-mono uppercase tracking-[0.16em]" style={{ color: 'var(--coral-ink)' }}>
            Choose your response · 选择回应
          </span>
          <button className="text-[10.5px] font-mono uppercase tracking-wider transition"
                  style={{ color: 'var(--muted)' }}>
            let me type freely
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {CHOICES.map((c, i) => <ChoiceCard key={i} index={i} choice={c} onSelect={onComplete} />)}
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({ index, choice, onSelect }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onSelect} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            className="text-left rounded-xl p-3.5 transition fade-up"
            style={{
              animationDelay: `${0.06 + index * 0.04}s`,
              background: hover ? '#F4F9F5' : 'var(--surface-c)',
              border: '1px solid ' + (hover ? 'var(--coral)' : 'var(--hairline-c)'),
            }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded grid place-items-center text-[10px] font-mono"
                style={{ background: '#EAF1EC', color: 'var(--muted)' }}>
            {String.fromCharCode(65 + index)}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--coral-ink)' }}>
            {choice.tone}
          </span>
        </div>
      </div>
      <p className="text-[13px] leading-snug" style={{ color: 'var(--ink)' }}>"{choice.text}"</p>
      <div className="text-[10.5px] mt-2 pt-2 leading-snug"
           style={{ color: 'var(--muted)', borderTop: '1px dashed var(--hairline-c)' }}>
        {choice.desc}
      </div>
    </button>
  );
}

// ---------- Right context panel ----------

function RightPanel({ state }) {
  if (state === 'c') return <RightPanelActive />;
  if (state === 'd') return <RightPanelAftermath />;
  if (state === 'b') return <RightPanelInvitation />;
  return <RightPanelCasual />;
}

function RightPanelCasual() {
  return (
    <aside className="pane-right">
      <SidebarHeader title="About this chat" />
      <div className="px-5 pb-4">
        <div className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          You and Lily started talking about your interview tomorrow. She seems to be picking up on your nerves.
        </div>
      </div>
      <DiagBlock label="Lily's read on you">
        <DiagItem>You're <span style={{ color: 'var(--ink)' }} className="font-medium">nervous</span> about something work-related</DiagItem>
        <DiagItem>You haven't eaten breakfast (mentioned coffee only)</DiagItem>
        <DiagItem>You usually arrive at the shop around 9:00</DiagItem>
      </DiagBlock>
      <DiagBlock label="Topics mentioned" plum>
        <Chip>job interview</Chip><Chip>marketing</Chip><Chip>Manhattan</Chip><Chip>stomach nerves</Chip>
      </DiagBlock>
    </aside>
  );
}

function RightPanelInvitation() {
  return (
    <aside className="pane-right">
      <SidebarHeader title="A suggestion is forming" />
      <div className="px-5 pb-3">
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Based on the conversation, Lily is about to suggest a roleplay. This isn't a system prompt — it emerges from her persona.
        </p>
      </div>
      <DiagBlock label="Why Lily is suggesting this">
        <DiagItem>You mentioned a <span style={{ color: 'var(--ink)' }} className="font-medium">job interview tomorrow</span></DiagItem>
        <DiagItem>You said you're nervous about doing it in English</DiagItem>
        <DiagItem>Lily's persona includes prior HR experience</DiagItem>
        <DiagItem>Relationship is <span style={{ color: 'var(--ink)' }} className="font-medium">Friend</span> — low stakes</DiagItem>
      </DiagBlock>
      <DiagBlock label="If you accept" coral>
        <DiagItem>Lily takes on the role of a tough HR manager named Linda</DiagItem>
        <DiagItem>Roughly 6 exchanges, ~8 minutes</DiagItem>
        <DiagItem>You can pause or exit anytime — relationship stays</DiagItem>
      </DiagBlock>
    </aside>
  );
}

function RightPanelActive() {
  return (
    <aside className="pane-right">
      <SidebarHeader title="Linda's perspective" coral />
      <div className="px-5 pb-3">
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          "I want to see how this candidate handles pressure. The marketing role needs someone who can stay composed when something unexpected lands on the table."
        </p>
      </div>

      <DiagBlock label="What Linda is testing">
        <DiagItem><span style={{ color: 'var(--ink)' }} className="font-medium">Composure under pressure</span></DiagItem>
        <DiagItem>Honest self-assessment</DiagItem>
        <DiagItem>Polite hedging in formal register</DiagItem>
      </DiagBlock>

      <DiagBlock label="State" coral>
        <DiagItem>Impression: <span style={{ color: 'var(--ink)' }} className="font-medium">6 / 10</span> — interested but probing</DiagItem>
        <DiagItem>Stress: Medium — she's testing, not punishing</DiagItem>
        <DiagItem>Turns remaining: 5</DiagItem>
      </DiagBlock>

      <DiagBlock label="Choice preview · hover above to see live impact">
        <DiagItem>↗ Diplomatic — likely +Impression, +Composure</DiagItem>
        <DiagItem>⤴ Confident — risky, could read as arrogant</DiagItem>
        <DiagItem>↺ Reflective — buys time, shows honesty</DiagItem>
      </DiagBlock>
    </aside>
  );
}

function RightPanelAftermath() {
  return (
    <aside className="pane-right">
      <SidebarHeader title="Saved to your journey" />
      <div className="px-5 pb-3">
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          This scenario is now part of your story with Lily. She'll reference it in future chats.
        </p>
      </div>

      <DiagBlock label="What changed">
        <DiagItem>Relationship with Lily: <span style={{ color: 'var(--ink)' }} className="font-medium">Friend → Close friend</span></DiagItem>
        <DiagItem>+1 scenario practiced · +1 memory</DiagItem>
        <DiagItem>Polite hedging promoted from "trying" to "going well"</DiagItem>
      </DiagBlock>

      <DiagBlock label="New memory · AI noticed" plum>
        <div className="ai-border rounded-xl p-3 mt-1">
          <div className="font-serif text-[15px] leading-tight" style={{ color: 'var(--ink)', fontWeight: 700 }}>
            Polite Disagree-er
          </div>
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            You handled "tell me a weakness" by acknowledging and reframing — twice in one conversation. That phrasing is now part of your toolkit.
          </p>
        </div>
      </DiagBlock>

      <DiagBlock label="Recommended next">
        <DiagItem>Try <span style={{ color: 'var(--coral-ink)' }} className="font-medium">Salary Negotiation</span> with Linda — Lily will offer next time</DiagItem>
      </DiagBlock>
    </aside>
  );
}

function SidebarHeader({ title, coral }) {
  return (
    <div className="px-5 pt-6 pb-2">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em]"
           style={{ color: coral ? 'var(--coral-ink)' : 'var(--muted)' }}>
        Context · 上下文
      </div>
      <h3 className="font-serif text-[20px] mt-1" style={{ color: 'var(--ink)' }}>{title}</h3>
    </div>
  );
}

function DiagBlock({ label, children, coral, plum }) {
  const color = coral ? 'var(--coral-ink)' : plum ? 'var(--plum-ink)' : 'var(--muted)';
  const bg    = coral ? 'var(--coral-soft)' : plum ? 'var(--plum-soft)' : 'transparent';
  return (
    <div className="px-5 py-3.5" style={{ borderTop: '1px solid var(--hairline)', background: bg }}>
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] mb-2" style={{ color }}>
        {label}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function DiagItem({ children }) {
  return (
    <div className="text-[11.5px] leading-relaxed flex items-start gap-2" style={{ color: 'var(--ink-2)' }}>
      <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--coral)' }} />
      <span>{children}</span>
    </div>
  );
}

function Chip({ children }) {
  return (
    <span className="inline-block text-[10.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded mr-1 mb-1"
          style={{ background: 'var(--bg-warm)', color: 'var(--ink-2)' }}>
      {children}
    </span>
  );
}

// ---------- App ----------

const STATES = [
  { id: 'a', label: 'A · Casual',     subtitle: "Lily and the user chat about tomorrow's interview." },
  { id: 'b', label: 'B · Invitation', subtitle: 'Lily suggests a practice scenario from inside the chat.' },
  { id: 'c', label: 'C · Active',     subtitle: 'Same chat, warmer mood. HUD appears. Input becomes structured choices.' },
  { id: 'd', label: 'D · Aftermath',  subtitle: 'Back to casual. Summary card persists as a memory.' },
];

function App() {
  const initialState = {
    '#casual': 'a',
    '#invitation': 'b',
    '#active': 'c',
    '#aftermath': 'd',
  }[window.location.hash] || 'a';
  const [state, setState] = useState(initialState);
  const intense = state === 'c';
  const scrollRef = useRef(null);
  const thread = state === 'a' ? THREAD_A_WEB
               : state === 'b' ? THREAD_B_WEB
               : state === 'c' ? LINDA_MESSAGES
               : THREAD_D_WEB;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [state]);

  const current = STATES.find(s => s.id === state);

  return (
    <div className="app-shell chat-bg" data-screen-label={`0${STATES.findIndex(s => s.id === state) + 1} Web · ${current.label}`}
         style={{ background: intense ? 'var(--bg-warm-c)' : 'var(--bg)' }}>
      <WebConversationsRail activeId="lily" intense={intense} />

      <section className="pane-main">
        <ScenChatHeader intense={intense} />
        {intense && <ScenarioHUD />}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
          <div className="max-w-[820px] mx-auto py-2">
            {state === 'd'
              ? <div className="text-center mt-4 mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-[0.16em]" style={{ color: 'var(--muted)' }}>
                    ↑ 8 minutes of roleplay · scroll up to revisit
                  </span>
                </div>
              : <DayDivider label="Today · 今天" />}
            {state === 'c' && (
              <div className="text-center my-2 fade-up">
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] px-2.5 py-1 rounded-full"
                      style={{ background: 'var(--surface-2c)', color: 'var(--muted)', border: '1px solid var(--hairline-c)' }}>
                  roleplay started · 8:47
                </span>
              </div>
            )}
            {thread.map((m, i) => (
              <ScenMessage
                key={i}
                msg={m}
                intense={intense}
                onAcceptScenario={() => setState('c')}
                onDeclineScenario={() => setState('a')}
              />
            ))}
          </div>
        </div>
        {intense ? <ChoiceComposer onComplete={() => setState('d')} /> : <CasualComposer state={state} />}
      </section>

      <RightPanel state={state} />

      {/* Top state tabs */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 p-1 rounded-full"
           style={{ background: 'oklch(0.18 0.01 55 / 0.92)', backdropFilter: 'blur(8px)' }}>
        <span className="px-2 text-[9.5px] font-mono uppercase tracking-[0.18em]"
              style={{ color: 'oklch(0.62 0.03 55)' }}>States</span>
        {STATES.map(s => (
          <button key={s.id} onClick={() => setState(s.id)}
                  className="px-3 py-1.5 rounded-full text-[10.5px] font-mono uppercase tracking-wider transition"
                  style={{
                    background: state === s.id ? '#fff' : 'transparent',
                    color: state === s.id ? '#1F1B16' : 'oklch(0.78 0.02 60)',
                  }}>
            {s.label}
          </button>
        ))}
      </div>

      <WebDock current="03 Scenario" />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
