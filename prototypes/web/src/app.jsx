// Popcorn Language — Web Main App
// 3-pane layout: Conversations rail + Chat + Right context panel

const { useState, useEffect, useRef } = React;

// ---------- Thread (Lily, casual) ----------
const LILY_THREAD_WEB = [
  { from: 'npc',  text: "morning! you're earlier than usual today ☕", time: '9:02' },
  { from: 'user', text: "Yes, today I am go to library early.", time: '9:03',
    correction: {
      fixed: "Today I'm going to the library early.",
      noteZh: "「am go」把 be 动词和实义动词叠在了一起。表示\"正在进行/即将进行\"用现在进行时：am/is/are + V-ing。另外 library 前要加 the。",
      tag: 'Grammar · Tense'
    }
  },
  { from: 'npc',  text: "ohh study mode 📚 what's your usual order? i'll have it ready when you come back tomorrow", time: '9:03' },
  { from: 'user', text: "An oat milk latte, not too sweet. 谢谢!", time: '9:05' },
  { from: 'npc',  text: "bù yòng xiè 😄 oat latte, low sweet — got it.", time: '9:06' },
  { from: 'npc',  text: "hey random question — you're basically a brooklyn regular now. have you tried the everything bagel from murray's yet?", time: '9:06' },
  { from: 'user', text: "What is 'everything bagel'?", time: '9:07' },
  { from: 'npc',  text: "haha okay so — \"everything\" is the flavor. poppy seeds, sesame, garlic, onion, salt — basically everything on top. NYC classic.", time: '9:07' },
  { from: 'npc',  text: "wait you've NEVER had a bagel here?? we have to fix this", time: '9:08', isLatest: true },
];

// ---------- Chat header ----------

function WebChatHeader({ npc, onJourney }) {
  return (
    <header className="px-6 py-3.5 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
      <div className="flex items-center gap-3">
        <WebAvatar npc={npc} size={38} />
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-medium">{npc.name}</span>
            <span style={{ color: 'var(--plum)' }}>
              <svg viewBox="0 0 24 24" className="w-3 h-3 ai-dot" fill="currentColor">
                <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z"/>
              </svg>
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ml-1"
                  style={{ background: 'var(--plum-soft)', color: 'var(--plum-ink)' }}>
              AI · persona
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--moss)' }} />
            <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{npc.status}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
             style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <WebRelationshipDots value={npc.stageValue} />
          <span className="text-[11px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {RELATIONSHIP_LABEL[npc.relationship]}
          </span>
        </div>
        <button className="w-9 h-9 rounded-full grid place-items-center hover:bg-[var(--bg-warm)] transition"
                style={{ color: 'var(--muted)' }}>
          {WebI.more}
        </button>
      </div>
    </header>
  );
}

// ---------- Day divider ----------
function DayDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
      <span className="text-[9.5px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
    </div>
  );
}

// ---------- Message ----------
function MessageRow({ npc, msg, showCorrection, onToggle }) {
  const isUser = msg.from === 'user';
  return (
    <div className={`flex items-end gap-2 mb-2.5 fade-up ${isUser ? 'justify-end' : ''}`}>
      {!isUser && <WebAvatar npc={npc} size={26} />}
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[68%]`}>
        <div className="px-3.5 py-2.5 text-[14px] leading-relaxed"
             style={isUser
               ? { background: 'var(--bubble-sent)', color: 'var(--bubble-sent-ink)', borderRadius: '16px 16px 4px 16px', boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)' }
               : { background: 'var(--bubble-received)', color: 'var(--bubble-received-ink)', border: '1px solid var(--hairline)', borderRadius: '16px 16px 16px 4px', boxShadow: '0 1px 0.5px rgba(11,20,26,0.08)' }}>
          {msg.text}
        </div>
        <div className={`flex items-center gap-1.5 mt-1 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{msg.time}</span>
          {msg.correction && (
            <button onClick={onToggle} className="inline-flex items-center gap-1 text-[10.5px]"
                    style={{ color: 'var(--coral-ink)' }}>
              <span className="w-3 h-3">{WebI.pencil}</span>
              {showCorrection ? 'hide' : 'Lily noticed something — click to see'}
            </button>
          )}
        </div>
        {msg.correction && showCorrection && <CorrectionCard correction={msg.correction} />}
      </div>
    </div>
  );
}

function CorrectionCard({ correction }) {
  return (
    <div className="mt-2 rounded-xl p-3.5 max-w-[420px] fade-up"
         style={{ background: 'var(--coral-soft)', border: '1px solid oklch(0.86 0.07 45)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--coral-ink)' }}>
          {correction.tag}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider"
              style={{ color: 'var(--coral-ink)', opacity: 0.7 }}>
          ✨ AI
        </span>
      </div>
      <div className="text-[13.5px] font-medium leading-relaxed" style={{ color: 'var(--coral-ink)' }}>
        ✓ {correction.fixed}
      </div>
      <p className="text-[12px] mt-2 pt-2 leading-relaxed"
         style={{ color: 'var(--ink-2)', borderTop: '1px solid oklch(0.86 0.07 45 / 0.5)' }}>
        {correction.noteZh}
      </p>
    </div>
  );
}

// ---------- Typing ----------
function Typing({ npc }) {
  return (
    <div className="flex items-end gap-2 mb-2.5">
      <WebAvatar npc={npc} size={26} />
      <div className="px-3.5 py-3 rounded-2xl rounded-bl-md flex items-center gap-1"
           style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        <span className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: 'var(--muted)' }} />
        <span className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: 'var(--muted)' }} />
        <span className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: 'var(--muted)' }} />
        <span className="ml-1.5 text-[10.5px]" style={{ color: 'var(--muted)' }}>{npc.name} is typing</span>
      </div>
    </div>
  );
}

// ---------- Composer ----------
function Composer() {
  const [draft, setDraft] = useState('');
  const chips = ['Tell me more', 'Why?', '什么意思?', 'Recommend me one'];
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
          <button className="w-9 h-9 rounded-full grid place-items-center hover:bg-[var(--bg-warm)] transition"
                  style={{ color: 'var(--muted)' }}>{WebI.smile}</button>
          <button disabled={!draft.trim()}
                  className="h-9 px-4 rounded-full flex items-center gap-1.5 text-[13px] font-medium transition disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#fff' }}>
            Send <span className="w-4 h-4">{WebI.send}</span>
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            Grammar correction · ON
          </span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>
            ⌘↵ to send · local model
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Right context panel ----------

function RightPanel({ npc }) {
  return (
    <aside className="pane-right">
      {/* Persona block */}
      <div className="px-5 pt-6 pb-4 text-center">
        <div className="flex justify-center mb-3">
          <div className="rounded-2xl grid place-items-center"
               style={{
                 width: 88, height: 88,
                 background: npc.avatarBg,
                 color: npc.avatarInk,
                 fontSize: 44,
               }}>
            {npc.avatarGlyph}
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <span className="text-[17px] font-medium">{npc.name}</span>
          <span style={{ color: 'var(--plum)' }} className="ai-dot">{WebI.sparkleF}</span>
        </div>
        <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          AI · barista · Brooklyn
        </div>
        <p className="text-[12px] mt-3 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Friendly, casual, uses NYC slang. Knows a few Chinese words but answers in English.
        </p>
      </div>

      {/* Relationship */}
      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] mb-2"
             style={{ color: 'var(--muted)' }}>
          Relationship · 关系
        </div>
        <div className="flex items-center gap-2 mb-2">
          <WebRelationshipDots value={npc.stageValue} />
          <span className="text-[13px] font-medium">{RELATIONSHIP_LABEL[npc.relationship]}</span>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
          You've chatted <span style={{ color: 'var(--ink-2)' }} className="font-medium">8 times</span> over
          {' '}<span style={{ color: 'var(--ink-2)' }} className="font-medium">3 weeks</span>. She remembers you order oat milk lattes.
        </p>
      </div>

      {/* What Lily knows about you */}
      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] mb-2"
             style={{ color: 'var(--muted)' }}>
          What Lily knows about you
        </div>
        <ul className="space-y-1.5">
          <KnowItem>You're studying for the GRE</KnowItem>
          <KnowItem>You have a cat</KnowItem>
          <KnowItem>You prefer oat milk, no sugar</KnowItem>
          <KnowItem>You live near Murray's Bagels</KnowItem>
        </ul>
      </div>

      {/* Memories generated from this chat */}
      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="flex items-center gap-1.5 mb-2">
          <span style={{ color: 'var(--plum)' }}>{WebI.sparkleF}</span>
          <span className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--plum-ink)' }}>
            Memories from this chat
          </span>
        </div>
        <div className="ai-border rounded-xl p-3">
          <div className="font-serif text-[15px] leading-tight" style={{ color: 'var(--ink)', fontWeight: 700 }}>
            Coffee Order Expert
          </div>
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            You've ordered confidently in 3 different registers — casual, polite, apologetic.
          </p>
        </div>
      </div>

      {/* Languages used */}
      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] mb-2"
             style={{ color: 'var(--muted)' }}>
          Languages
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-medium">EN</span>
          <span style={{ color: 'var(--muted)' }}>·</span>
          <span style={{ color: 'var(--muted)' }}>occasional 中文</span>
          <span className="text-[9.5px] font-mono uppercase tracking-wider ml-auto px-1.5 py-0.5 rounded"
                style={{ background: 'var(--bg-warm)', color: 'var(--muted)' }}>
            EN-CN light
          </span>
        </div>
      </div>
    </aside>
  );
}

function KnowItem({ children }) {
  return (
    <li className="text-[12px] leading-relaxed flex items-start gap-2" style={{ color: 'var(--ink-2)' }}>
      <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--coral)' }} />
      <span>{children}</span>
    </li>
  );
}

// ---------- Main app ----------

function App() {
  const [activeId, setActiveId] = useState('lily');
  const [expanded, setExpanded] = useState(1);
  const npc = NPCS_WEB.find(n => n.id === activeId);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeId]);

  return (
    <div className="app-shell" data-screen-label="01 Web · Main App">
      <WebConversationsRail activeId={activeId} onSelect={setActiveId} />

      <section className="pane-main">
        <WebChatHeader npc={npc} />
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
          <div className="max-w-[820px] mx-auto py-2">
            <DayDivider label="Today · 今天" />
            {LILY_THREAD_WEB.map((m, i) => (
              <MessageRow key={i} npc={npc} msg={m}
                          showCorrection={!!m.correction && expanded === i}
                          onToggle={() => setExpanded(expanded === i ? -1 : i)} />
            ))}
            <Typing npc={npc} />
          </div>
        </div>
        <Composer />
      </section>

      <RightPanel npc={npc} />

      <WebDock current="01 Main App" />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
