// Scenario presentational components — extracted from routes/Scenario.tsx so both the
// inline experience (App.tsx) and the (now redirect) /scenario route share one source.
import { WebI, WebAvatar, WebRelationshipDots, RELATIONSHIP_LABEL } from '../shared';
import type { LearningUpdateItem } from '@popcorn/shared';
import { STATUS_LABEL } from '../learning';

// ---------- Chat header ----------

export function ScenChatHeader({ intense, session, hudState, npc, onPause, onEnd, pausing = false, ending = false, pauseDisabled = false, endDisabled = false }: {
  intense: boolean;
  session: any;
  hudState: any;
  npc: any;
  onPause?: () => void;
  onEnd?: () => void;
  pausing?: boolean;
  ending?: boolean;
  pauseDisabled?: boolean;
  endDisabled?: boolean;
}) {
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
              {intense ? <>{npc.name} <span className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>as</span> NPC</> : npc.name}
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
          <>
          <button onClick={onPause} disabled={pausing || ending || pauseDisabled}
                  className="px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider transition hover:bg-[var(--bg-warm)]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--hairline-strong)', color: 'var(--ink-2)' }}>
            <span className="inline-flex items-center gap-1.5">{WebI.pause} {pausing ? 'Pausing...' : 'Pause'}</span>
          </button>
          <button onClick={onEnd} disabled={pausing || ending || endDisabled}
                  className="px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider transition hover:opacity-70 disabled:opacity-40"
                  style={{ color: 'var(--coral-ink)' }}>
            {ending ? 'Ending...' : 'End'}
          </button>
          </>
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

export function ScenarioCompletionRetry({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="px-6 py-3 flex items-center justify-between gap-4"
         style={{ background: 'var(--surface-2c)', borderTop: '1px solid var(--hairline-c)' }}
         role="status" aria-live="polite">
      <div className="min-w-0">
        <div className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>Your final turn is saved.</div>
        <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--muted)' }}>The review could not be prepared yet.</div>
      </div>
      <button type="button" onClick={onRetry} disabled={retrying}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11px] font-medium transition disabled:opacity-60"
              style={{ background: 'var(--coral)', color: '#fff' }}>
        <span className="w-3.5 h-3.5">{WebI.recall}</span>
        {retrying ? 'Preparing review...' : 'Retry review'}
      </button>
    </div>
  );
}

// ---------- Scenario HUD ----------

export function ScenarioHUD({ session, hudState }: { session: any; hudState: any }) {
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

export function ScenarioReviewBar({ session, onBack }: { session: any; onBack: () => void }) {
  return (
    <div className="px-6 py-2.5 flex items-center justify-between gap-3"
         style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--hairline)' }}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-4 h-4" style={{ color: 'var(--coral-ink)' }}>{WebI.bldg}</span>
        <span className="text-[11px] font-mono uppercase tracking-wider truncate" style={{ color: 'var(--ink-2)' }}>
          Reviewing · {session?.scenarioTitle || 'Scenario'}
        </span>
      </div>
      <button type="button" onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition hover:bg-[var(--surface)]"
              style={{ color: 'var(--ink-2)', border: '1px solid var(--hairline-strong)' }}>
        <span className="w-3.5 h-3.5">{WebI.arrowL}</span> Back to chat
      </button>
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
export function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
      <span className="text-[9.5px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
    </div>
  );
}

// ---------- Message bubbles ----------
export function ScenMessage({ msg, intense, npc }: { msg: any; intense: boolean; npc: any }) {
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

// ---------- Resume banner (an in-progress scenario, shown in casual chat) ----------
export function ScenarioResumeBanner({ session, onResume, onEnd, resuming = false, ending = false }: {
  session: any;
  onResume: () => void;
  onEnd: () => void;
  resuming?: boolean;
  ending?: boolean;
}) {
  const title = session ? session.scenarioTitle : 'Scenario';
  const stateLabel = session?.status === 'paused' ? 'paused' : 'in progress';
  return (
    <div className="my-3 px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 fade-up"
         style={{ background: 'var(--coral-soft)', border: '1px solid var(--coral)' }}>
      <span className="text-[12.5px]" style={{ color: 'var(--coral-ink)' }}>
        🎭 <strong>{title}</strong> {stateLabel}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onResume} disabled={resuming || ending}
                className="rounded-full px-3.5 py-1.5 text-[12px] font-medium transition disabled:opacity-60"
                style={{ background: 'var(--coral)', color: '#fff' }}>
          {resuming ? 'Restoring...' : 'Resume'}
        </button>
        <button onClick={onEnd} disabled={resuming || ending}
                className="rounded-full px-3 py-1.5 text-[12px] transition hover:bg-[var(--surface)] disabled:opacity-40"
                style={{ color: 'var(--ink-2)', border: '1px solid var(--hairline-strong)' }}>
          {ending ? 'Ending...' : 'End'}
        </button>
      </div>
    </div>
  );
}

// ---------- Invitation card ----------
export function InvitationCard({ session, onAccept, onDecline, npc, accepting = false }: { session: any; onAccept: () => void; onDecline: () => void; npc: any; accepting?: boolean }) {
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
            <button onClick={onAccept} disabled={accepting}
                    className="rounded-full px-5 py-2.5 text-[13px] font-medium transition disabled:opacity-70"
                    style={{ background: 'var(--coral)', color: '#fff', boxShadow: '0 1px 0 oklch(1 0 0 / 0.3) inset' }}>
              {accepting ? <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Preparing scenario…</span> : "Yeah, let's do it"}
            </button>
            <button onClick={onDecline} disabled={accepting}
                    className="rounded-full px-4 py-2 text-[12.5px] transition hover:bg-[var(--bg-warm)] disabled:opacity-50"
                    style={{ color: 'var(--ink-2)', border: '1px solid var(--hairline-strong)' }}>
              Maybe later
            </button>
          </div>
          {accepting && <p className="mt-2.5 text-[11.5px]" style={{ color: 'var(--muted)' }} aria-live="polite">Lily is getting the roleplay ready…</p>}
        </div>
      </div>
    </div>
  );
}

// ---------- Summary card ----------
export function ScenarioHistoryCard({ npc, item, onReview, reviewing = false, reviewFailed = false }: {
  npc: any;
  item: any;
  onReview: () => void;
  reviewing?: boolean;
  reviewFailed?: boolean;
}) {
  return (
    <div className="flex items-end gap-2 mb-2.5 fade-up">
      <WebAvatar npc={npc} size={26} />
      <button type="button" onClick={onReview} disabled={reviewing}
              className="w-full max-w-[520px] text-left rounded-lg px-4 py-3 transition enabled:hover:bg-[var(--coral-soft)] disabled:opacity-60"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline-strong)' }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[9.5px] font-mono uppercase tracking-[0.16em]" style={{ color: 'var(--coral-ink)' }}>
              Scenario completed
            </div>
            <div className="text-[14px] font-medium mt-1 truncate" style={{ color: 'var(--ink)' }}>
              {item.scenarioTitle || 'Scenario'}
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11px] mt-2" style={{ color: 'var(--ink-2)' }}>
              {reviewing ? 'Opening review...' : reviewFailed ? 'Could not open · Try again' : 'Review roleplay'}
              {!reviewing && !reviewFailed && <span className="w-3.5 h-3.5">{WebI.arrowR}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded"
                 style={{ background: 'var(--moss-soft)', color: 'var(--moss)' }}>
              Grade {item.scenarioGrade || '—'}
            </div>
            {item.time && <div className="text-[9.5px] font-mono mt-2" style={{ color: 'var(--muted)' }}>{item.time}</div>}
          </div>
        </div>
      </button>
    </div>
  );
}

export function ScenarioSummaryCard({ session, transcript, summaryData, onContinueChat }: {
  session: any;
  transcript: any[];
  summaryData: any;
  onContinueChat?: () => void;
}) {
  const grade = (session && session.grade) || (summaryData && summaryData.grade) || '—';
  const title = session ? session.scenarioTitle : 'Scenario';
  const languageNote = summaryData && summaryData.languageNote;
  const pragmaticsNote = summaryData && summaryData.pragmaticsNote;
  const relationshipNote = summaryData && summaryData.relationshipNote;
  const hasNotes = languageNote || pragmaticsNote || relationshipNote;
  const summaryBlocks = hasNotes
    ? [
        languageNote && { icon: '🗣️', label: 'Language', body: languageNote },
        pragmaticsNote && { icon: '🧠', label: 'Pragmatics', body: pragmaticsNote },
        relationshipNote && { icon: '❤️', label: 'Relationship', body: relationshipNote },
      ].filter(Boolean)
    : [
        { icon: '🗣️', label: 'Language', body: 'Performance summary is not available for this session.' },
        { icon: '🧠', label: 'Pragmatics', body: 'Pragmatics notes are not available.' },
        { icon: '❤️', label: 'Relationship', body: 'Relationship notes are not available.' },
      ];

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

      <div className="grid grid-cols-3 gap-3">
        {summaryBlocks.map((block) => (
          <SummaryBlock key={block.label} icon={block.icon} label={block.label}>
            {block.body}
          </SummaryBlock>
        ))}
      </div>

      <LearningUpdateBlock items={summaryData?.learningUpdate} />

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
        {onContinueChat ? (
          <button type="button" onClick={onContinueChat}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition hover:bg-[var(--coral-soft)]"
                  style={{ color: 'var(--coral-ink)', border: '1px solid var(--hairline-strong)' }}>
            Continue chatting <span className="w-3.5 h-3.5">{WebI.arrowR}</span>
          </button>
        ) : (
          <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: 'var(--coral-ink)' }}>
            Grade: {grade}
          </span>
        )}
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

// A delta < 3% is noise (single low-confidence signal). Present as "no change" so users
// aren't told they moved when they didn't. Threshold matches design in the spec.
const NO_CHANGE_DELTA = 0.03;

function LearningUpdateBlock({ items }: { items?: LearningUpdateItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-4 pt-3" style={{ borderTop: '1px dashed var(--hairline-2)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          Learning update · 学习进度
        </span>
        <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>
          {items.length} target skill{items.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => {
          const changed = Math.abs(item.delta) >= NO_CHANGE_DELTA;
          const glyph = !changed ? '→' : item.delta > 0 ? '↗' : '↘';
          const color = !changed ? 'var(--muted)' : item.delta > 0 ? 'var(--moss)' : 'var(--coral-ink)';
          const statusLabel = STATUS_LABEL[item.status];
          return (
            <div key={item.skillCode} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                 style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium truncate" style={{ color: 'var(--ink)' }}>{item.labelEn}</div>
                <div className="text-[10.5px] font-mono mt-0.5" style={{ color: 'var(--muted)' }}>{item.labelZh}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span aria-label={changed ? (item.delta > 0 ? 'improving' : 'declining') : 'no change'}
                      className="text-[13px]" style={{ color }}>{glyph}</span>
                <span className="text-[10.5px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                  {changed ? statusLabel : 'no change'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Composers ----------

export function ChoiceComposer({ choices, onChoose, disabled }: { choices: any[]; onChoose: (choice: any) => void; disabled: boolean }) {
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
  return (
    <button
      onClick={() => !disabled && onChoose(choice)}
      disabled={disabled}
      className="text-left rounded-xl p-3.5 transition fade-up border border-[var(--hairline-c)] bg-[var(--surface-c)] enabled:cursor-pointer enabled:hover:bg-[#F4F9F5] enabled:hover:border-[var(--coral)] disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        animationDelay: `${0.06 + index * 0.04}s`,
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

export function ScenarioRightPanel({ status, session, summaryData, hudState }: { status: string | null; session: any; summaryData: any; hudState: any }) {
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
export function EmptyState() {
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
      </div>
    </div>
  );
}
