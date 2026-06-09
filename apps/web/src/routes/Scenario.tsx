// Popcorn Language — Web Scenario (Live Session Player)
// Wired to the backend session lifecycle: invited → active → completed.

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { SessionDetailResponse, ScenarioTranscriptItem, AcceptSessionResponse } from '@popcorn/shared';
import {
  WebI,
  NPCS_WEB,
  RELATIONSHIP_LABEL,
  WebAvatar,
  WebRelationshipDots,
  WebDock,
  WebConversationsRail,
} from '../components/shared';

// ---------- Chat header ----------

function ScenChatHeader({ intense, session, hudState }: { intense: boolean; session: any; hudState: any }) {
  const npc = NPCS_WEB[0]; // Lily
  const turnsLeft = hudState ? hudState.turnsLeft : 0;
  const titleLabel = session ? session.scenarioTitle : '';
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
              {intense ? <>Lily <span className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>as</span> NPC</> : 'Lily'}
            </span>
            <span style={{ color: 'var(--plum)' }}>
              <svg viewBox="0 0 24 24" className="w-3 h-3 ai-dot" fill="currentColor">
                <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z"/>
              </svg>
            </span>
            {intense && (
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ml-1"
                    style={{ background: 'oklch(0.92 0.05 150)', color: 'var(--accent-ink)' }}>
                Roleplay · {titleLabel}
              </span>
            )}
          </div>
          <div className="text-[11px] mt-0.5"
               style={{ color: intense ? 'var(--coral-ink)' : 'var(--muted)' }}>
            {intense
              ? ('Active scenario · ' + turnsLeft + ' turn' + (turnsLeft === 1 ? '' : 's') + ' left')
              : npc.status}
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

function ScenarioHUD({ session, hudState }: { session: any; hudState: any }) {
  const title = session ? session.scenarioTitle : '';
  const impression = hudState ? hudState.impression : 5;
  const stress = hudState ? hudState.stress : 'Medium';
  return (
    <div className="px-6 py-2.5 flex items-center justify-between gap-3 fade-up"
         style={{ background: 'var(--surface-2c)', borderBottom: '1px solid var(--hairline-c)' }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-4 h-4" style={{ color: 'var(--coral-ink)' }}>{WebI.bldg}</span>
        <span className="text-[11px] font-mono uppercase tracking-[0.16em]" style={{ color: 'var(--coral-ink)' }}>
          {title}
        </span>
      </div>
      <div className="flex items-center gap-5">
        <HUDMeter label="Impression" filled={impression} total={10} />
        <HUDStress level={stress} />
      </div>
    </div>
  );
}

function HUDMeter({ label, filled, total }: { label: string; filled: number; total: number }) {
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

function HUDStress({ level }: { level: string }) {
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
function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
      <span className="text-[9.5px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
    </div>
  );
}

// ---------- Message bubbles ----------
function ScenMessage({ msg, intense }: { msg: any; intense: boolean }) {
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

  const isUser = msg.from === 'user';
  const isNpc = msg.from === 'npc' || msg.from === 'npc-c';
  const npc = NPCS_WEB[0];

  return (
    <div className={`flex items-end gap-2 mb-2.5 fade-up ${isUser ? 'justify-end' : ''}`}>
      {!isUser && <WebAvatar npc={npc} size={26} />}
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[68%]`}>
        <div className="px-3.5 py-2.5 text-[14px] leading-relaxed"
             style={isUser
               ? { background: 'var(--bubble-sent)', color: 'var(--bubble-sent-ink)', borderRadius: '16px 16px 4px 16px', boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)' }
               : msg.from === 'npc-c'
               ? { background: '#F1ECE0', color: '#3A3120',
                   border: '1px solid #DDD3BD', borderRadius: '16px 16px 16px 4px', boxShadow: '0 1px 0.5px rgba(11,20,26,0.08)' }
               : { background: 'var(--bubble-received)', color: 'var(--bubble-received-ink)', border: '1px solid var(--hairline)', borderRadius: '16px 16px 16px 4px', boxShadow: '0 1px 0.5px rgba(11,20,26,0.08)' }}>
          {msg.text}
        </div>
        {msg.time && (
          <div className={`flex items-center gap-1.5 mt-1 ${isUser ? 'flex-row-reverse' : ''}`}>
            <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{msg.time}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Invitation card ----------
function InvitationCard({ session, onAccept, onDecline }: { session: any; onAccept: () => void; onDecline: () => void }) {
  const npc = NPCS_WEB[0];
  const title = session ? session.scenarioTitle : 'Scenario';
  return (
    <div className="flex items-start gap-2 mb-3 fade-up">
      <WebAvatar npc={npc} size={26} />
      <div className="flex-1 min-w-0 max-w-[560px]">
        <div className="px-3.5 py-2.5 text-[14px] leading-relaxed inline-block"
             style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline)',
                      borderRadius: '16px 16px 16px 4px' }}>
          Hey — want to try a practice scenario? I'll set it up for us.
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
              Scenario invitation · {title}
            </span>
          </div>
          <p className="text-[14px] leading-relaxed mb-3.5" style={{ color: 'var(--ink)' }}>
            You have been invited to a <strong>{title}</strong> scenario. Accept to start the roleplay session.
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
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Summary card ----------
function ScenarioSummaryCard({ session, transcript, summaryData }: { session: any; transcript: any[]; summaryData: any }) {
  const grade = (session && session.grade) || (summaryData && summaryData.grade) || '—';
  const title = session ? session.scenarioTitle : 'Scenario';
  const languageNote = summaryData && summaryData.languageNote;
  const pragmaticsNote = summaryData && summaryData.pragmaticsNote;
  const relationshipNote = summaryData && summaryData.relationshipNote;

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
              {title} · complete
            </div>
            <div className="text-[16px] font-medium mt-0.5" style={{ color: 'var(--ink)' }}>
              Scenario Summary · Grade: {grade}
            </div>
          </div>
        </div>
        <span className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-1 rounded"
              style={{ background: 'var(--moss-soft)', color: 'var(--moss)' }}>
          ✓ saved to journey
        </span>
      </div>

      {(languageNote || pragmaticsNote || relationshipNote) ? (
        <div className="grid grid-cols-3 gap-3">
          {languageNote && (
            <SummaryBlock icon="🗣️" label="Language">
              {languageNote}
            </SummaryBlock>
          )}
          {pragmaticsNote && (
            <SummaryBlock icon="🧠" label="Pragmatics">
              {pragmaticsNote}
            </SummaryBlock>
          )}
          {relationshipNote && (
            <SummaryBlock icon="❤️" label="Relationship">
              {relationshipNote}
            </SummaryBlock>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <SummaryBlock icon="🗣️" label="Language">
            Performance summary is not available for this session.
          </SummaryBlock>
          <SummaryBlock icon="🧠" label="Pragmatics">
            Pragmatics notes are not available.
          </SummaryBlock>
          <SummaryBlock icon="❤️" label="Relationship">
            Relationship notes are not available.
          </SummaryBlock>
        </div>
      )}

      {transcript && transcript.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px dashed var(--hairline-2)' }}>
          <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
            Transcript · {transcript.length} turns
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {transcript.map((t) => (
              <div key={t.id} className="text-[12px] leading-relaxed"
                   style={{ color: t.from === 'user' ? 'var(--ink)' : 'var(--ink-2)' }}>
                <span className="font-mono text-[10px] mr-2"
                      style={{ color: 'var(--muted)' }}>
                  {t.from === 'user' ? 'You' : 'NPC'}
                </span>
                {t.text}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-4 pt-3"
           style={{ borderTop: '1px dashed var(--hairline-2)' }}>
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          ✨ AI · local
        </span>
        <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: 'var(--coral-ink)' }}>
          Grade: {grade}
        </span>
      </div>
    </div>
  );
}

function SummaryBlock({ icon, label, children }: { icon: string; label: string; children: any }) {
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

function ChoiceComposer({ choices, onChoose, disabled }: { choices: any[]; onChoose: (choice: any) => void; disabled: boolean }) {
  return (
    <div className="px-6 pb-4 pt-3" style={{ background: 'linear-gradient(180deg, transparent, var(--bg-warm-c) 40%)' }}>
      <div className="max-w-[820px] mx-auto">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10.5px] font-mono uppercase tracking-[0.16em]" style={{ color: 'var(--coral-ink)' }}>
            Choose your response · 选择回应
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {(choices || []).map((c, i) => (
            <ChoiceCard key={c.id || i} index={i} choice={c} onChoose={onChoose} disabled={disabled} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({ index, choice, onChoose, disabled }: { index: number; choice: any; onChoose: (choice: any) => void; disabled: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => !disabled && onChoose(choice)}
      disabled={disabled}
      className="text-left rounded-xl p-3.5 transition fade-up"
      style={{
        animationDelay: `${0.06 + index * 0.04}s`,
        background: hover && !disabled ? '#F4F9F5' : 'var(--surface-c)',
        border: '1px solid ' + (hover && !disabled ? 'var(--coral)' : 'var(--hairline-c)'),
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded grid place-items-center text-[10px] font-mono"
                style={{ background: '#EAF1EC', color: 'var(--muted)' }}>
            {String.fromCharCode(65 + index)}
          </span>
          {choice.tone && (
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--coral-ink)' }}>
              {choice.tone}
            </span>
          )}
        </div>
      </div>
      <p className="text-[13px] leading-snug" style={{ color: 'var(--ink)' }}>"{choice.text}"</p>
      {choice.desc && (
        <div className="text-[10.5px] mt-2 pt-2 leading-snug"
             style={{ color: 'var(--muted)', borderTop: '1px dashed var(--hairline-c)' }}>
          {choice.desc}
        </div>
      )}
    </button>
  );
}

// ---------- Right context panel ----------

function RightPanel({ status, session, summaryData, hudState }: { status: string | null; session: any; summaryData: any; hudState: any }) {
  if (status === 'completed') return <RightPanelAftermath session={session} summaryData={summaryData} />;
  if (status === 'active') return <RightPanelActive session={session} hudState={hudState} />;
  if (status === 'invited') return <RightPanelInvitation session={session} />;
  return <RightPanelEmpty />;
}

function RightPanelEmpty() {
  return (
    <aside className="pane-right">
      <SidebarHeader title="No scenario yet" />
      <div className="px-5 pb-4">
        <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Keep chatting with an NPC to unlock a scenario invitation.
        </p>
        <a href="/"
           className="mt-3 inline-block text-[12px] font-mono uppercase tracking-wider no-underline"
           style={{ color: 'var(--coral-ink)' }}>
          ← Back to chats
        </a>
      </div>
    </aside>
  );
}

function RightPanelInvitation({ session }: { session: any }) {
  const title = session ? session.scenarioTitle : 'Scenario';
  return (
    <aside className="pane-right">
      <SidebarHeader title="Scenario invitation" />
      <div className="px-5 pb-3">
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          You have been invited to a <strong>{title}</strong> scenario.
        </p>
      </div>
      <DiagBlock label="What to expect">
        <DiagItem>Roleplay practice with an NPC</DiagItem>
        <DiagItem>Multiple turns with choices to guide conversation</DiagItem>
        <DiagItem>A grade and summary when done</DiagItem>
      </DiagBlock>
    </aside>
  );
}

function RightPanelActive({ session, hudState }: { session: any; hudState: any }) {
  const title = session ? session.scenarioTitle : 'Scenario';
  const impression = hudState ? hudState.impression : 5;
  const stress = hudState ? hudState.stress : 'Medium';
  const turnsLeft = hudState ? hudState.turnsLeft : '?';
  return (
    <aside className="pane-right">
      <SidebarHeader title={title} coral />
      <DiagBlock label="Current state" coral>
        <DiagItem>Impression: <span style={{ color: 'var(--ink)' }} className="font-medium">{impression} / 10</span></DiagItem>
        <DiagItem>Stress: <span style={{ color: 'var(--ink)' }} className="font-medium">{stress}</span></DiagItem>
        <DiagItem>Turns remaining: <span style={{ color: 'var(--ink)' }} className="font-medium">{turnsLeft}</span></DiagItem>
      </DiagBlock>
      <DiagBlock label="Tip">
        <DiagItem>Choose thoughtfully — each response affects impression and stress.</DiagItem>
      </DiagBlock>
    </aside>
  );
}

function RightPanelAftermath({ session, summaryData }: { session: any; summaryData: any }) {
  const grade = (session && session.grade) || (summaryData && summaryData.grade) || '—';
  const title = session ? session.scenarioTitle : 'Scenario';
  return (
    <aside className="pane-right">
      <SidebarHeader title="Saved to your journey" />
      <div className="px-5 pb-3">
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          This scenario is now part of your story. Grade: <strong>{grade}</strong>
        </p>
      </div>
      <DiagBlock label="Scenario completed">
        <DiagItem>{title} · complete</DiagItem>
        <DiagItem>Grade: <span style={{ color: 'var(--ink)' }} className="font-medium">{grade}</span></DiagItem>
        <DiagItem>+1 scenario practiced · saved to journey</DiagItem>
      </DiagBlock>
    </aside>
  );
}

function SidebarHeader({ title, coral }: { title: string; coral?: boolean }) {
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

function DiagBlock({ label, children, coral, plum }: { label: string; children: any; coral?: boolean; plum?: boolean }) {
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

function DiagItem({ children }: { children: any }) {
  return (
    <div className="text-[11.5px] leading-relaxed flex items-start gap-2" style={{ color: 'var(--ink-2)' }}>
      <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--coral)' }} />
      <span>{children}</span>
    </div>
  );
}

// ---------- Empty state ----------
function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
      <span className="text-[48px]">🎭</span>
      <div className="text-center">
        <div className="text-[18px] font-medium mb-2" style={{ color: 'var(--ink)' }}>
          No scenarios yet
        </div>
        <p className="text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Keep chatting with an NPC to unlock one.
        </p>
        <a href="/"
           className="mt-4 inline-block text-[13px] font-medium no-underline"
           style={{ color: 'var(--coral-ink)' }}>
          ← Back to chats
        </a>
      </div>
    </div>
  );
}

// ---------- App ----------

export default function Scenario() {
  // session: the list-level session object (id, status, grade, scenarioTitle, npcId)
  const [session, setSession] = useState<any>(null);
  // detailSession: full session detail from GET /sessions/:id (for completed)
  const [detailSession, setDetailSession] = useState<any>(null);
  // transcript: array of { id, role, from, text, meta, createdAt }
  const [transcript, setTranscript] = useState<any[]>([]);
  // messages: live messages shown in the chat area during active play
  // Each: { from: 'user'|'npc-c', text, time? }
  const [messages, setMessages] = useState<any[]>([]);
  // choices: current choice set during active play
  const [choices, setChoices] = useState<any[]>([]);
  // hudState: { impression, stress, turnsLeft }
  const [hudState, setHudState] = useState<any>(null);
  // summaryData: { grade, languageNote, pragmaticsNote, relationshipNote } from scenario_end or completed fetch
  const [summaryData, setSummaryData] = useState<any>(null);
  // loading / error
  const [loading, setLoading] = useState(true);
  const [choiceDisabled, setChoiceDisabled] = useState(false);
  // npcTyping: show typing indicator
  const [npcTyping, setNpcTyping] = useState(false);
  // finalSummary: when scenario_end received during active play
  const [finalSummary, setFinalSummary] = useState<any>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Derived status: what to render
  const status = finalSummary ? 'completed'
               : session ? session.status
               : null;

  const intense = status === 'active';

  // Scroll to bottom on messages change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, transcript, finalSummary]);

  // Mount: load sessions, pick best session to show
  useEffect(() => {
    setLoading(true);
    api.me()
      .then(() => api.sessions())
      .then((list) => {
        const active  = list.find((s) => s.status === 'active');
        const invited = list.find((s) => s.status === 'invited');
        const done    = list.find((s) => s.status === 'completed');
        const picked  = active || invited || done || null;
        setSession(picked);
        setLoading(false);
        // For completed sessions, fetch detail immediately
        if (picked && picked.status === 'completed') {
          api.session(picked.id).then((detail: SessionDetailResponse) => {
            setDetailSession(detail.session);
            setTranscript(detail.transcript || []);
            if (detail.state) setHudState(detail.state);
          }).catch(() => {});
        }
        // For active sessions, fetch detail to get initial state and any existing transcript
        if (picked && picked.status === 'active') {
          api.session(picked.id).then((detail: SessionDetailResponse) => {
            setDetailSession(detail.session);
            setTranscript(detail.transcript || []);
            if (detail.state) setHudState(detail.state);
            // Rebuild messages from transcript
            const msgs = (detail.transcript || []).map((t: ScenarioTranscriptItem) => ({
              from: t.from === 'user' ? 'user' : 'npc-c',
              text: t.text,
              time: t.createdAt ? new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            }));
            setMessages(msgs);
          }).catch(() => {});
        }
      })
      .catch((e: any) => {
        if (e.status === 401) navigate('/onboarding');
        setLoading(false);
      });
  }, []);

  // Accept an invited session
  function handleAccept() {
    if (!session) return;
    setChoiceDisabled(true);
    api.acceptSession(session.id)
      .then((result: AcceptSessionResponse) => {
        // Transition to active: update session status in local state
        setSession((prev: any) => prev ? Object.assign({}, prev, { status: 'active' }) : prev);
        // Opening message from NPC
        const opening = result.openingMessage;
        if (opening) {
          setMessages([{
            from: 'npc-c',
            text: opening.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }]);
        }
        // Set initial choices
        if (result.choices) setChoices(result.choices);
        // Set initial HUD state from returned state
        if (result.state) setHudState(result.state);
        setChoiceDisabled(false);
      })
      .catch(() => {
        setChoiceDisabled(false);
      });
  }

  // Decline an invited session
  function handleDecline() {
    if (!session) return;
    api.declineSession(session.id)
      .then(() => {
        setSession(null);
      })
      .catch(() => {});
  }

  // Handle a choice in the active scenario
  function handleChoose(choice: any) {
    if (!session || choiceDisabled) return;
    setChoiceDisabled(true);

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Append user's chosen text immediately
    setMessages((prev) => prev.concat({
      from: 'user',
      text: choice.text,
      time: timeStr,
    }));

    api.streamChoose(session.id, choice.id, (event) => {
      if (event.type === 'typing_start') {
        setNpcTyping(true);
      } else if (event.type === 'typing_end') {
        setNpcTyping(false);
      } else if (event.type === 'message_complete') {
        setNpcTyping(false);
        setMessages((prev) => prev.concat({
          from: 'npc-c',
          text: event.data.fullText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
      } else if (event.type === 'state_update') {
        setHudState({
          impression: event.data.impression,
          stress: event.data.stress,
          turnsLeft: event.data.turnsLeft,
        });
      } else if (event.type === 'choices') {
        setChoices(event.data.choices);
        setChoiceDisabled(false);
      } else if (event.type === 'scenario_end') {
        setFinalSummary(event.data.summary);
        setSummaryData(event.data.summary);
        setChoices([]);
        setChoiceDisabled(false);
      } else if (event.type === 'error') {
        // Re-enable choices so user can retry
        setNpcTyping(false);
        setChoiceDisabled(false);
        setMessages((prev) => prev.concat({
          from: 'system',
          text: 'Connection error — please try again.',
        }));
      }
      // 'done' event: ignore (stream finished)
    });
  }

  // Effective summary for the summary card
  const effectiveSummary = finalSummary || summaryData;
  const effectiveSession = detailSession || session;

  return (
    <div className="app-shell chat-bg"
         style={{ background: intense ? 'var(--bg-warm-c)' : 'var(--bg)' }}>
      <WebConversationsRail activeId="lily" intense={intense} />

      <section className="pane-main">
        <ScenChatHeader intense={intense} session={effectiveSession} hudState={hudState} />
        {intense && <ScenarioHUD session={effectiveSession} hudState={hudState} />}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
          <div className="max-w-[820px] mx-auto py-2">
            {loading && (
              <div className="text-center mt-8">
                <span className="text-[12px] font-mono" style={{ color: 'var(--muted)' }}>Loading…</span>
              </div>
            )}

            {!loading && status === null && <EmptyState />}

            {!loading && status === 'invited' && session && (
              <>
                <DayDivider label="Today · 今天" />
                <InvitationCard
                  session={session}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                />
              </>
            )}

            {!loading && status === 'active' && (
              <>
                <div className="text-center my-2 fade-up">
                  <span className="text-[10px] font-mono uppercase tracking-[0.16em] px-2.5 py-1 rounded-full"
                        style={{ background: 'var(--surface-2c)', color: 'var(--muted)', border: '1px solid var(--hairline-c)' }}>
                    Roleplay started
                  </span>
                </div>
                {messages.map((m, i) => <ScenMessage key={i} msg={m} intense={true} />)}
                {npcTyping && (
                  <div className="flex items-end gap-2 mb-2.5 fade-up">
                    <WebAvatar npc={NPCS_WEB[0]} size={26} />
                    <div className="px-3.5 py-2.5 text-[14px]"
                         style={{ background: 'var(--bubble-received)', color: 'var(--bubble-received-ink)',
                                  border: '1px solid var(--hairline)', borderRadius: '16px 16px 16px 4px' }}>
                      <span className="font-mono text-[12px]" style={{ color: 'var(--muted)' }}>…</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {!loading && status === 'completed' && (
              <>
                <DayDivider label="Completed scenario · 已完成" />
                <ScenarioSummaryCard
                  session={effectiveSession}
                  transcript={transcript}
                  summaryData={effectiveSummary}
                />
              </>
            )}
          </div>
        </div>

        {status === 'active' && !finalSummary && choices.length > 0 && (
          <ChoiceComposer
            choices={choices}
            onChoose={handleChoose}
            disabled={choiceDisabled}
          />
        )}
      </section>

      <RightPanel
        status={status}
        session={effectiveSession}
        summaryData={effectiveSummary}
        hudState={hudState}
      />

      <WebDock current="02 Scenario" />
    </div>
  );
}
