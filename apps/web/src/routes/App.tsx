// Popcorn Language — Web Main App
// 3-pane layout: Conversations rail + Chat + Right context panel

import { Fragment, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { ThreadMessage, NpcDetail, MemoryItem, ScenarioChoice } from '@popcorn/shared';
import {
  WebI,
  RELATIONSHIP_LABEL,
  WebAvatar,
  WebRelationshipDots,
  WebConversationsRail,
  npcView,
} from '../components/shared';
import { declinedReplyToCasualMessage, useScenarioSession } from '../components/scenario/useScenarioSession';
import {
  correctionNotice,
  isCasualComposerDisabled,
  messageDayKey,
  messageDayLabel,
  prependTimeline,
} from './chatState';
import {
  ScenChatHeader,
  ScenarioHUD,
  ScenarioReviewBar,
  DayDivider as ScenDayDivider,
  ScenMessage,
  InvitationCard,
  ScenarioResumeBanner,
  ScenarioHistoryCard,
  ScenarioSummaryCard,
  ScenarioCompletionRetry,
  ChoiceComposer,
  ScenarioRightPanel,
} from '../components/scenario/parts';

// ---------- Mappers ----------
function fmtTime(iso: any) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function mapMsg(m: ThreadMessage) {
  return { id: m.id, kind: m.kind, from: m.from, text: m.text,
           time: m.createdAt ? fmtTime(m.createdAt) : '',
           createdAt: m.createdAt,
           correction: m.correction || null, retracted: m.retracted, retractedText: m.retractedText,
           scenarioSessionId: m.scenarioSessionId, scenarioTitle: m.scenarioTitle, scenarioGrade: m.scenarioGrade };
}

// ---------- Chat header ----------

function WebChatHeader({ npc }: { npc: any }) {
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
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
           style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        <WebRelationshipDots value={npc.stageValue} />
        <span className="text-[11px] font-medium" style={{ color: 'var(--ink-2)' }}>
          {RELATIONSHIP_LABEL[npc.relationship]}
        </span>
      </div>
    </header>
  );
}

// ---------- Day divider ----------
function DayDivider({ label }: { label: string }) {
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
function MessageRow({ npc, msg, showCorrection, onToggle, onRecall, onEdit, onRestore, recalling, live = false }: {
  npc: any;
  msg: any;
  showCorrection: boolean;
  onToggle: () => void;
  onRecall?: (messageId: string) => void;
  onEdit?: (text: string) => void;
  onRestore?: (messageId: string) => void;
  recalling?: boolean;
  live?: boolean;
}) {
  const isUser = msg.from === 'user';
  const retracted = !!msg.retracted;
  if (retracted) {
    return (
      <div className="my-4 flex flex-col items-center gap-1 fade-up">
        <div className="flex items-center gap-2 text-[14px]" style={{ color: 'var(--muted)' }}>
          <span>Message retracted</span>
          {msg.retractedText && onEdit && (
            <button type="button" onClick={() => onEdit(msg.retractedText)}
                    className="font-medium transition hover:opacity-70"
                    style={{ color: 'var(--accent-ink)' }}>
              Edit
            </button>
          )}
          {msg.retractedText && onRestore && msg.id && (
            <button type="button" onClick={() => onRestore(msg.id)}
                    className="font-medium transition hover:opacity-70"
                    style={{ color: 'var(--accent-ink)' }}>
              Undo recall
            </button>
          )}
        </div>
        {msg.time && <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{msg.time}</span>}
      </div>
    );
  }
  return (
    <div data-testid={live ? 'live-npc-response' : undefined}
         className={`group flex items-end gap-2 mb-2.5 fade-up ${isUser ? 'justify-end' : ''}`}>
      {!isUser && <WebAvatar npc={npc} size={26} />}
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[68%]`}>
        <div className="px-3.5 py-2.5 text-[14px] leading-relaxed"
             style={retracted
               ? { background: 'var(--surface-2)', color: 'var(--muted)', border: '1px dashed var(--hairline-strong)', borderRadius: '16px 16px 4px 16px', fontStyle: 'italic' }
               : isUser
               ? { background: 'var(--bubble-sent)', color: 'var(--bubble-sent-ink)', borderRadius: '16px 16px 4px 16px', boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)' }
               : { background: 'var(--bubble-received)', color: 'var(--bubble-received-ink)', border: '1px solid var(--hairline)', borderRadius: '16px 16px 16px 4px', boxShadow: '0 1px 0.5px rgba(11,20,26,0.08)', opacity: msg.error ? 0.7 : 1, outline: msg.error ? '1px solid var(--coral)' : 'none' }}>
          {msg.text}
        </div>
        <div className={`flex items-center gap-1.5 mt-1 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{msg.time}</span>
          {isUser && !retracted && msg.id && onRecall && (
            <button
              type="button"
              onClick={() => onRecall(msg.id)}
              disabled={recalling}
              title="Recall message"
              aria-label="Recall message"
              className="w-5 h-5 grid place-items-center rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition disabled:opacity-40"
              style={{ color: 'var(--muted)' }}>
              {WebI.recall}
            </button>
          )}
          {!retracted && msg.correction && (
            <button onClick={onToggle} className="inline-flex items-center gap-1 text-[10.5px]"
                    style={{ color: 'var(--coral-ink)' }}>
              <span className="w-3 h-3">{WebI.pencil}</span>
              {correctionNotice(npc.name, showCorrection)}
            </button>
          )}
        </div>
        {!retracted && msg.correction && showCorrection && <CorrectionCard correction={msg.correction} />}
      </div>
    </div>
  );
}

function CorrectionCard({ correction }: { correction: any }) {
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
function Typing({ npc }: { npc: any }) {
  return (
    <div data-testid="npc-typing" className="flex items-end gap-2 mb-2.5">
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
function Composer({ onSend, disabled, draftValue, onDraftChange, focusSignal, showSuggestions = true }: {
  onSend: (text: string) => void;
  disabled: boolean;
  draftValue?: string;
  onDraftChange?: (value: string) => void;
  focusSignal?: number;
  showSuggestions?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const value = draftValue === undefined ? draft : draftValue;
  const chips = ['Tell me more', 'Why?', '什么意思?', 'Recommend me one'];
  const submit = () => {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setDraft('');
    onDraftChange?.('');
  };
  useEffect(() => {
    if (focusSignal !== undefined && focusSignal > 0) textareaRef.current?.focus();
  }, [focusSignal]);
  return (
    <div className="px-6 pb-4 pt-3">
      <div className="max-w-[820px] mx-auto">
        {showSuggestions !== false && (
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[10px] font-mono uppercase tracking-wider shrink-0" style={{ color: 'var(--muted)' }}>
              ✨ Suggest
            </span>
            {chips.map(c => (
              <button key={c} onClick={() => { setDraft(c); onDraftChange?.(c); }}
                      className="shrink-0 px-3 py-1.5 rounded-full text-[12.5px] transition hover:bg-[var(--surface)]"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}>
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl p-2 pl-3"
             style={{ background: 'var(--surface)', border: '1px solid var(--hairline-2)' }}>
          <button className="w-9 h-9 rounded-full grid place-items-center hover:bg-[var(--bg-warm)] transition"
                  style={{ color: 'var(--muted)' }}>{WebI.plus}</button>
          <textarea ref={textareaRef} value={value} onChange={e => { setDraft(e.target.value); onDraftChange?.(e.target.value); }} rows={1}
                    placeholder="Type in English or 中文…"
                    onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }}
                    className="flex-1 resize-none bg-transparent outline-none py-2 text-[14px] placeholder:text-[var(--muted)]"
                    style={{ minHeight: 24, maxHeight: 120 }} />
          <button className="w-9 h-9 rounded-full grid place-items-center hover:bg-[var(--bg-warm)] transition"
                  style={{ color: 'var(--muted)' }}>{WebI.smile}</button>
          <button onClick={submit} disabled={disabled}
                  className="h-9 px-4 rounded-full flex items-center gap-1.5 text-[13px] font-medium transition"
                  style={{ background: 'var(--accent)', color: '#fff', opacity: (!value.trim() || disabled) ? 0.4 : 1 }}>
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

function RightPanel({ detail, memories }: { detail: NpcDetail | null; memories: MemoryItem[] }) {
  if (!detail) return <aside className="pane-right" />;
  const lp = detail.languageProfile;
  const langLabel = (c: string) => (({ en: 'EN', zh: '中文', ja: '日本語' } as Record<string, string>)[c] || c.toUpperCase());
  const dots = detail.relationship === 'close' ? 3 : detail.relationship === 'friend' ? 2 : 1;
  const isCJK = /[一-龥]/.test(detail.avatar.glyph);
  return (
    <aside className="pane-right">
      <div className="px-5 pt-6 pb-4 text-center">
        <div className="flex justify-center mb-3">
          <div className="rounded-2xl grid place-items-center"
               style={{ width: 88, height: 88, background: detail.avatar.bg, color: detail.avatar.ink, fontSize: 44, fontFamily: isCJK ? "'Outfit', sans-serif" : 'inherit' }}>
            {detail.avatar.glyph}
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <span className="text-[17px] font-medium">{detail.name}</span>
          <span style={{ color: 'var(--plum)' }} className="ai-dot">{WebI.sparkleF}</span>
        </div>
        <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          AI · {detail.persona}
        </div>
      </div>

      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--muted)' }}>Relationship · 关系</div>
        <div className="flex items-center gap-2 mb-2">
          <WebRelationshipDots value={dots} />
          <span className="text-[13px] font-medium">{RELATIONSHIP_LABEL[detail.relationship] || detail.relationship}</span>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
          {detail.chatStats.practiceTurns > 0
            ? <><span style={{ color: 'var(--ink-2)' }} className="font-medium">{detail.chatStats.practiceTurns} practice turn{detail.chatStats.practiceTurns === 1 ? '' : 's'}</span> together.</>
            : 'No practice turns yet.'}
        </p>
      </div>

      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--muted)' }}>What {detail.name} knows about you</div>
        {detail.knownFacts.length > 0
          ? <ul className="space-y-1.5">{detail.knownFacts.map((f, i) => <KnowItem key={i}>{f}</KnowItem>)}</ul>
          : <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Nothing yet — keep chatting.</p>}
      </div>

      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="flex items-center gap-1.5 mb-2">
          <span style={{ color: 'var(--plum)' }}>{WebI.sparkleF}</span>
          <span className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--plum-ink)' }}>Memories from this chat</span>
        </div>
        {memories.length > 0
          ? <div className="ai-border rounded-xl p-3">
              <div className="font-serif text-[15px] leading-tight" style={{ color: 'var(--ink)', fontWeight: 700 }}>{memories[0].title}</div>
              <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--ink-2)' }}>{memories[0].body}</p>
            </div>
          : <p className="text-[11px]" style={{ color: 'var(--muted)' }}>No memories yet.</p>}
      </div>

      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--muted)' }}>Languages</div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-medium">{langLabel(lp.primary)}</span>
          {lp.occasional.length > 0 && <>
            <span style={{ color: 'var(--muted)' }}>·</span>
            <span style={{ color: 'var(--muted)' }}>occasional {lp.occasional.map(langLabel).join(', ')}</span>
          </>}
          <span className="text-[9.5px] font-mono uppercase tracking-wider ml-auto px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-warm)', color: 'var(--muted)' }}>{lp.register}</span>
        </div>
        {detail.topicInterests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {detail.topicInterests.map((t) => (
              <span key={t} className="text-[10.5px] font-mono px-2 py-1 rounded" style={{ background: 'var(--bg-warm)', color: 'var(--ink-2)' }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function KnowItem({ children }: { children: any }) {
  return (
    <li className="text-[12px] leading-relaxed flex items-start gap-2" style={{ color: 'var(--ink-2)' }}>
      <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--coral)' }} />
      <span>{children}</span>
    </li>
  );
}

// ---------- Main app ----------

export default function App() {
  const navigate = useNavigate();
  const [npcs, setNpcs] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [typing, setTyping] = useState(false);
  const [streaming, setStreaming] = useState('');   // live NPC token buffer
  const [sending, setSending] = useState(false);
  const [recallingId, setRecallingId] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState('');
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [expanded, setExpanded] = useState(-1);
  const [detail, setDetail] = useState<NpcDetail | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(activeId);
  const chatStreamSeqRef = useRef(0);
  const chatAbortRef = useRef<AbortController | null>(null);
  const historySeqRef = useRef(0);
  const olderPendingRef = useRef(false);
  const prependScrollRef = useRef<{ height: number; top: number } | null>(null);
  const skipAutoScrollRef = useRef(false);
  const scen = useScenarioSession(activeId);
  const casualComposerDisabled = isCasualComposerDisabled({
    sending,
    recallingId,
    acceptingScenario: scen.accepting,
    decliningScenario: scen.declining,
  });

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // auth gate + initial NPC load
  useEffect(() => {
    api.me()
      .then(() => api.npcs())
      .then((list) => {
        const mapped = list.map(npcView);
        setNpcs(mapped);
        // If a ?npc= hint is present, honour it once (e.g. Journey "Start now" hand-off).
        const params = new URLSearchParams(window.location.search);
        const npcHint = params.get('npc');
        const preferred = npcHint && mapped.some((n) => n.id === npcHint) ? npcHint : null;
        setActiveId((cur) => preferred || cur || (mapped[0] && mapped[0].id));
        if (npcHint) {
          const url = new URL(window.location.href);
          url.searchParams.delete('npc');
          window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
        }
      })
      .catch((e: any) => {
        if (e.status === 401) navigate('/onboarding');
      });
  }, []);

  // load thread when active NPC changes
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const historySeq = ++historySeqRef.current;
    olderPendingRef.current = false;
    prependScrollRef.current = null;
    setHasMore(false); setLoadingOlder(false); setHistoryError(false);
    chatAbortRef.current = null;
    chatStreamSeqRef.current += 1;
    setStreaming(''); setTyping(false); setSending(false); setMessages([]); setDetail(null); setMemories([]);
    setRecallingId(null);
    setComposerDraft('');
    api.thread(activeId)
      .then((r) => {
        if (!cancelled && historySeq === historySeqRef.current) {
          setMessages((r.messages || []).map(mapMsg));
          setHasMore(r.hasMore);
        }
      })
      .catch(() => { if (!cancelled) setMessages([]); });
    api.npcDetail(activeId)
      .then((r) => { if (!cancelled) setDetail(r); })
      .catch(() => { if (!cancelled) setDetail(null); });
    api.memories(activeId)
      .then((r) => { if (!cancelled) setMemories(r); })
      .catch(() => { if (!cancelled) setMemories([]); });
    return () => {
      cancelled = true;
      historySeqRef.current += 1;
      chatAbortRef.current = null;
      chatStreamSeqRef.current += 1;
    };
  }, [activeId]);

  useLayoutEffect(() => {
    if (prependScrollRef.current && scrollRef.current) {
      const { height, top } = prependScrollRef.current;
      scrollRef.current.scrollTop = top + scrollRef.current.scrollHeight - height;
      prependScrollRef.current = null;
      skipAutoScrollRef.current = true;
    }
  }, [messages]);

  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming, typing, scen.npcTyping, scen.declinedReply]);

  useEffect(() => {
    if (scen.status === 'completed' && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [scen.status, scen.session?.id]);

  function send(text: string) {
    if (!text.trim() || casualComposerDisabled || !activeId) return;
    const sendNpcId = activeId;
    const declinedMessage = declinedReplyToCasualMessage(scen.declinedReply);
    if (declinedMessage) {
      setMessages((current) => declinedMessage.id && current.some((message) => message.id === declinedMessage.id)
        ? current
        : current.concat(declinedMessage));
    }
    scen.clearDeclinedReply();
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const streamSeq = ++chatStreamSeqRef.current;
    setSending(true); setStreaming('');
    let acc = '';
    let terminal = false;
    api.streamMessage(sendNpcId, text, (ev) => {
      if (terminal || activeIdRef.current !== sendNpcId || chatStreamSeqRef.current !== streamSeq) return;
      switch (ev.type) {
        case 'user_message_saved':
          const userCreatedAt = ev.data.createdAt || new Date().toISOString();
          setMessages((m) => m.concat([{ id: ev.data.messageId, from: 'user', text: text,
            time: fmtTime(userCreatedAt), createdAt: userCreatedAt, correction: null }]));
          break;
        case 'typing_start': setTyping(true); break;
        case 'token':
          setTyping(false); // the first visible token replaces the pending typing indicator
          acc += ev.data.delta || '';
          setStreaming(acc);
          break;
        case 'typing_end': setTyping(false); break;
        case 'message_complete':
          const npcCreatedAt = new Date().toISOString();
          setStreaming('');
          setMessages((m) => m.concat([{ id: ev.data.messageId, from: 'npc',
            text: ev.data.fullText || acc, time: fmtTime(npcCreatedAt), createdAt: npcCreatedAt, correction: null }]));
          break;
        case 'correction':
          setMessages((m) => m.map((x) => x.id === ev.data.targetMessageId
            ? Object.assign({}, x, { correction: ev.data.correction }) : x));
          break;
        case 'scenario_offer': {
          const draft = (ev.data as any).draft || {};
          scen.offerSession(ev.data.sessionId, draft.title || 'Scenario');
          break;
        }
        case 'error':
          terminal = true;
          chatStreamSeqRef.current += 1;
          controller.abort();
          if (chatAbortRef.current === controller) chatAbortRef.current = null;
          setTyping(false); setStreaming(''); setSending(false);
          setMessages((m) => m.concat([{ id: 'err-' + Date.now(), from: 'npc', error: true,
            text: (ev.data.code === 'LLM_UNAVAILABLE'
              ? 'Local model unavailable — start Ollama (qwen3.5:9b) and retry.'
              : ('Error: ' + (ev.data.message || ev.data.code))), time: fmtTime(Date.now()), correction: null }]));
          break;
        case 'done': terminal = true; setSending(false); break;
        default: break;
      }
    }, controller.signal).catch(() => {
      if (activeIdRef.current === sendNpcId && chatStreamSeqRef.current === streamSeq) setSending(false);
    }).finally(() => {
      if (chatAbortRef.current === controller) chatAbortRef.current = null;
    });
  }

  function stopChatStream() {
    chatStreamSeqRef.current += 1;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setStreaming('');
    setTyping(false);
    setSending(false);
  }

  function invalidateHistory() {
    historySeqRef.current += 1;
    olderPendingRef.current = false;
    prependScrollRef.current = null;
    setLoadingOlder(false); setHistoryError(false);
  }

  async function loadOlder() {
    const before = messages[0]?.id;
    if (!activeId || !before || !hasMore || olderPendingRef.current || recallingId) return;
    const npcId = activeId;
    const requestId = historySeqRef.current;
    olderPendingRef.current = true;
    setLoadingOlder(true); setHistoryError(false);
    try {
      const page = await api.thread(npcId, 50, before);
      if (activeIdRef.current !== npcId || historySeqRef.current !== requestId) return;
      if (scrollRef.current) {
        prependScrollRef.current = { height: scrollRef.current.scrollHeight, top: scrollRef.current.scrollTop };
      }
      setMessages((current) => prependTimeline(page.messages.map(mapMsg), current));
      setExpanded(-1);
      setHasMore(page.hasMore && page.messages.length > 0 && page.messages[0].id !== before);
    } catch {
      if (historySeqRef.current === requestId) setHistoryError(true);
    } finally {
      if (historySeqRef.current === requestId) {
        olderPendingRef.current = false;
        setLoadingOlder(false);
      }
    }
  }

  async function recallMessage(messageId: string) {
    if (!activeId || recallingId) return;
    const npcId = activeId;
    stopChatStream();
    invalidateHistory();
    setRecallingId(messageId);
    try {
      await api.recallMessage(npcId, messageId);
      if (activeIdRef.current !== npcId) return;
      setMessages((current) => {
        const index = current.findIndex((message) => message.id === messageId);
        if (index < 0) return current;
        return current.slice(0, index + 1).map((message) => message.id === messageId
          ? { ...message, text: 'Message retracted', retracted: true, retractedText: message.text, correction: null }
          : message);
      });
      scen.clearForRecall();
    } catch {
      // Keep the original bubble when the server cannot retract it.
    } finally {
      setRecallingId(null);
    }
  }

  async function restoreRecalledMessage(messageId: string) {
    if (!activeId || recallingId) return;
    const npcId = activeId;
    stopChatStream();
    invalidateHistory();
    setRecallingId(messageId);
    try {
      await api.restoreRecalledMessage(npcId, messageId);
      const thread = await api.thread(npcId);
      if (activeIdRef.current !== npcId) return;
      setMessages((thread.messages || []).map(mapMsg));
      setHasMore(thread.hasMore);
      await scen.refreshSessions();
    } catch {
      // Keep the rolled-back view when restoration fails.
    } finally {
      setRecallingId(null);
    }
  }

  function editRecalledMessage(text: string) {
    setComposerDraft(text);
    setComposerFocusSignal((value) => value + 1);
  }

  function continueFromScenario() {
    const npcId = activeId;
    invalidateHistory();
    const requestId = historySeqRef.current;
    scen.continueChatting();
    setComposerFocusSignal((value) => value + 1);
    if (!npcId) return;
    api.thread(npcId)
      .then((thread) => {
        if (activeIdRef.current === npcId && historySeqRef.current === requestId) {
          setMessages((thread.messages || []).map(mapMsg));
          setHasMore(thread.hasMore);
        }
      })
      .catch(() => {});
  }

  const npc = npcs.find((n) => n.id === activeId);
  if (!npc) {
    return <div className="app-shell" data-screen-label="01 Web · Main App"
                style={{ display: 'grid', placeItems: 'center' }}>
             <span style={{ color: 'var(--muted)' }}>Loading…</span>
           </div>;
  }

  return (
    <div className="app-shell" data-screen-label="01 Web · Main App">
      <WebConversationsRail npcs={npcs} activeId={activeId ?? undefined} onSelect={setActiveId} />
      <section className="pane-main">
        {scen.status === 'active'
          ? <ScenChatHeader intense={true} session={scen.session} hudState={scen.hudState} npc={npc}
                            onPause={scen.pause} onEnd={scen.abort} pausing={scen.pausing}
                            ending={scen.ending} pauseDisabled={scen.choiceDisabled}
                            endDisabled={scen.choiceDisabled && !scen.completionFailed} />
          : <WebChatHeader npc={npc} />}
        {scen.status === 'active' && <ScenarioHUD session={scen.session} hudState={scen.hudState} />}
        {scen.status === 'completed' && <ScenarioReviewBar session={scen.session} onBack={continueFromScenario} />}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
          <div className="max-w-[820px] mx-auto py-2">
            {scen.status === 'active' ? (
              <>
                <div className="text-center my-2 fade-up">
                  <span className="text-[10px] font-mono uppercase tracking-[0.16em] px-2.5 py-1 rounded-full"
                        style={{ background: 'var(--surface-2c)', color: 'var(--muted)', border: '1px solid var(--hairline-c)' }}>
                    Roleplay started
                  </span>
                </div>
                {scen.messages.map((m, i) => <ScenMessage key={i} msg={m} intense={true} npc={npc} />)}
                {scen.npcTyping && <Typing npc={npc} />}
              </>
            ) : scen.status === 'completed' ? (
              <>
                <ScenDayDivider label="Scenario review · 复盘" />
                <ScenarioSummaryCard session={scen.session} transcript={scen.transcript} summaryData={scen.summary}
                                     onContinueChat={continueFromScenario} />
              </>
            ) : (
              <>
                {hasMore && (
                  <div className="flex flex-col items-center gap-1 py-3">
                    <button type="button" onClick={loadOlder} disabled={loadingOlder || !!recallingId}
                            className="text-sm px-3 py-1 disabled:opacity-50" style={{ color: 'var(--ink-2)' }}>
                      {loadingOlder ? 'Loading earlier messages...' : 'Load earlier messages'}
                    </button>
                    {historyError && <span role="alert" className="text-xs">Could not load earlier messages. Please try again.</span>}
                  </div>
                )}
                {messages.map((m, i) => (
                  <Fragment key={m.id || i}>
                    {m.createdAt && (i === 0 || !messages[i - 1]?.createdAt
                      || messageDayKey(m.createdAt) !== messageDayKey(messages[i - 1].createdAt)) && (
                      <DayDivider label={messageDayLabel(m.createdAt)} />
                    )}
                    {m.kind === 'scenario' ? (
                      <ScenarioHistoryCard npc={npc} item={m}
                                           reviewing={scen.reviewingSessionId === m.scenarioSessionId}
                                           reviewFailed={scen.reviewErrorSessionId === m.scenarioSessionId}
                                           onReview={() => m.scenarioSessionId && scen.reviewCompleted(m.scenarioSessionId)} />
                    ) : (
                      <MessageRow npc={npc} msg={m}
                                  showCorrection={!!m.correction && expanded === i}
                                  onToggle={() => setExpanded(expanded === i ? -1 : i)}
                                  onRecall={recallMessage} onEdit={editRecalledMessage} onRestore={restoreRecalledMessage}
                                  recalling={recallingId === m.id} />
                    )}
                  </Fragment>
                ))}
                {scen.declinedReply && (
                  <MessageRow npc={npc} msg={{ from: scen.declinedReply.from === 'user' ? 'user' : 'npc', text: scen.declinedReply.text, time: scen.declinedReply.time || '' }}
                              showCorrection={false} onToggle={() => {}} />
                )}
                {streaming && <MessageRow npc={npc} msg={{ from: 'npc', text: streaming, time: '' }}
                                          showCorrection={false} onToggle={() => {}} live />}
                {(typing || scen.npcTyping) && <Typing npc={npc} />}
                {scen.resumable && (
                  <ScenarioResumeBanner session={scen.resumable} onResume={scen.resume} onEnd={scen.abort}
                                        resuming={scen.resuming} ending={scen.ending} />
                )}
                {scen.status === 'invited' && (
                  <InvitationCard session={scen.session} npc={npc}
                                  onAccept={scen.accept} onDecline={scen.decline} accepting={scen.accepting} />
                )}
              </>
            )}
          </div>
        </div>

        {scen.status === 'active' ? (
          scen.completionFailed ? (
            <ScenarioCompletionRetry onRetry={scen.retryCompletion} retrying={scen.retryingCompletion} />
          ) : (
            <>
              {scen.choices.length > 0 && (
                <ChoiceComposer choices={scen.choices} onChoose={(c: ScenarioChoice) => scen.choose(c)} disabled={scen.choiceDisabled} />
              )}
              <Composer onSend={(t: string) => scen.freetype(t)} disabled={scen.choiceDisabled} showSuggestions={false} />
            </>
          )
        ) : scen.status === 'completed' ? null : (
          <Composer onSend={send} disabled={casualComposerDisabled}
                    draftValue={composerDraft} onDraftChange={setComposerDraft} focusSignal={composerFocusSignal} />
        )}
      </section>
      {scen.status
        ? <ScenarioRightPanel status={scen.status} session={scen.session} summaryData={scen.summary} hudState={scen.hudState} />
        : <RightPanel detail={detail} memories={memories} />}
    </div>
  );
}
