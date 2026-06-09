// Shared design primitives for the web UI variant.
// Ported from public/app/src/shared.jsx — faithful ES-module + TypeScript translation.

import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

const Icon = ({ d, className = "w-5 h-5", strokeWidth = 1.6 }: { d: ReactNode; className?: string; strokeWidth?: number }) =>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>;

export const WebI = {
  search: <Icon d={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>} />,
  settings: <Icon d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9 1.65 1.65 0 0 0 4.27 7.18l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.14.68.36 1 .59.32.23.59.51.79.83A1.65 1.65 0 0 0 21 11h.09a2 2 0 1 1 0 4H21a1.65 1.65 0 0 0-1.5 1Z" /></>} />,
  send: <Icon d={<><path d="M3.4 20.6 21 12 3.4 3.4 3 10l12 2-12 2z" /></>} />,
  plus: <Icon d={<><path d="M12 5v14M5 12h14" /></>} />,
  smile: <Icon d={<><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8 14s1.5 2 4 2 4-2 4-2" /></>} />,
  more: <Icon d={<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>} />,
  arrowR: <Icon d={<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>} />,
  arrowL: <Icon d={<><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>} />,
  chev: <Icon d={<><path d="m6 9 6 6 6-6" /></>} />,
  chevR: <Icon d={<><path d="m9 6 6 6-6 6" /></>} />,
  flame: <Icon d={<><path d="M12 3s4 4 4 8a4 4 0 0 1-8 0c0-1.5.5-2.5 1.5-3.5C10 6 12 3 12 3Z" /><path d="M9.5 14.5c0 2 1 3.5 2.5 3.5s2.5-1.5 2.5-3.5" /></>} />,
  msgs: <Icon d={<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z" /></>} />,
  book: <Icon d={<><path d="M2 4h7a3 3 0 0 1 3 3v13" /><path d="M22 4h-7a3 3 0 0 0-3 3v13" /><path d="M2 4v15h7" /><path d="M22 4v15h-7" /></>} />,
  user: <Icon d={<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>} />,
  globe: <Icon d={<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>} />,
  pencil: <Icon d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></>} />,
  bldg: <Icon d={<><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 8h.01M9 12h.01M9 16h.01M15 8h.01M15 12h.01M15 16h.01" /></>} />,
  pause: <Icon d={<><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>} />,
  shield: <Icon d={<><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /></>} />,
  sparkleF: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z" /></svg>,
  checkF: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M9.5 16.5 4 11l1.4-1.4 4.1 4.1L18.6 4.5 20 5.9z" /></svg>
};

export const NPCS_WEB = [
{
  id: 'lily', name: 'Lily', avatarGlyph: '☕',
  avatarBg: '#D5F2DC', avatarInk: '#15784A',
  relationship: 'friend', stageValue: 2,
  status: 'Usually replies quickly',
  lastPreview: "wait you've NEVER had a bagel here?? we have to fix this",
  lastPreviewZh: null,
  time: '2m',
  hasSomething: true
},
{
  id: 'chen', name: 'Mr. Chen', avatarGlyph: '陈',
  avatarBg: 'oklch(0.93 0.02 250)', avatarInk: 'oklch(0.40 0.06 250)',
  relationship: 'acquaintance', stageValue: 1,
  status: 'Active earlier',
  lastPreview: "Let me know when you have a moment to sync.",
  lastPreviewZh: '有空时告诉我一声，我们对一下。',
  time: '1h',
  hasSomething: false
},
{
  id: 'emma', name: 'Emma', avatarGlyph: 'E',
  avatarBg: 'oklch(0.93 0.04 340)', avatarInk: 'oklch(0.48 0.10 340)',
  relationship: 'close', stageValue: 3,
  status: 'Usually replies quickly',
  lastPreview: "okok send me a pic of your cat RIGHT NOW i need serotonin",
  lastPreviewZh: null,
  time: '5h',
  hasSomething: false
}];


export const RELATIONSHIP_LABEL: Record<string, string> = {
  acquaintance: 'Acquaintance',
  friend: 'Friend',
  close: 'Close friend'
};

export function WebAvatar({ npc, size = 40, hasSomething }: { npc: any; size?: number; hasSomething?: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="rounded-full grid place-items-center"
      style={{
        width: size, height: size,
        background: npc.avatarBg,
        color: npc.avatarInk,
        fontSize: size * 0.46,
        fontFamily: /[\u4e00-\u9fa5]/.test(npc.avatarGlyph) ? "'Outfit', sans-serif" : 'inherit'
      }}>
        {npc.avatarGlyph}
      </div>
      {hasSomething &&
      <span className="absolute -top-0.5 -right-0.5 pulse-subtle"
      style={{ color: 'var(--coral-ink)' }}>
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
            <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z" />
          </svg>
        </span>
      }
    </div>);

}

export function WebRelationshipDots({ value, size = 5 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[0, 1, 2].map((i) =>
      <span key={i} className="rounded-full"
      style={{
        width: size, height: size,
        background: i < value ? 'var(--coral)' : 'var(--hairline-strong)'
      }} />
      )}
    </span>);

}

// Cross-file dock — bottom-right so it doesn't collide with state tabs
export function WebDock({ current }: { current?: string }) {
  const items = [
  { label: '01 Main App', href: '/' },
  { label: '02 Scenario', href: '/scenario' },
  { label: '03 Onboarding & Journey', href: '/onboarding' }];

  return (
    <div className="fixed bottom-3 right-3 z-50 flex items-center gap-1 p-1 rounded-full"
    style={{ background: 'oklch(0.18 0.01 55 / 0.92)', backdropFilter: 'blur(8px)' }}>
      <span className="px-2 text-[9.5px] font-mono uppercase tracking-[0.18em]"
      style={{ color: 'oklch(0.62 0.03 55)' }}>
        Web demo
      </span>
      {items.map((i) =>
      <Link key={i.label} to={i.href}
      className="px-3 py-1.5 rounded-full text-[10.5px] font-mono uppercase tracking-wider transition no-underline"
      style={{
        background: i.label === current ? '#fff' : 'transparent',
        color: i.label === current ? '#1F1B16' : 'oklch(0.78 0.02 60)'
      }}>
          {i.label}
        </Link>
      )}
      <span className="w-px h-4 mx-0.5" style={{ background: 'oklch(0.38 0.02 55)' }} />
      <a href="http://localhost:3100/app/design-canvas.html" target="_blank" rel="noreferrer"
      className="px-3 py-1.5 rounded-full text-[10.5px] font-mono uppercase tracking-wider transition no-underline"
      style={{ color: 'oklch(0.78 0.02 60)' }}>
        ↗ Canvas
      </a>
    </div>);

}

// Left nav rail — shared between web app and journey screens
export function WebNavRail({ activeTop = 'chats' }: { activeTop?: string }) {
  const [j, setJ] = useState<any>(null);
  useEffect(() => {
    api.journey().then(setJ).catch(() => {});
  }, []);
  const items = [
  { id: 'chats', label: 'Chats', icon: WebI.msgs, href: '/' },
  { id: 'journey', label: 'Your Journey', icon: WebI.book, href: '/onboarding' },
  { id: 'settings', label: 'Settings', icon: WebI.settings, href: '#' }];

  return (
    <nav className="pane-nav flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg grid place-items-center"
          style={{ width: 32, height: 32, background: 'var(--brand-bg)', color: 'var(--brand-ink)' }}>
            <span style={{ fontWeight: 700, fontSize: 18, lineHeight: 1 }}>P</span>
          </div>
          <div className="leading-tight">
            <div className="font-serif text-[18px]">Popcorn</div>
            <div className="text-[9.5px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
              Language
            </div>
          </div>
        </div>
      </div>

      {/* Streak strip */}
      <div className="mx-4 mb-4 rounded-xl px-3 py-2.5 flex items-center gap-2"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
        <span style={{ color: 'var(--coral-ink)' }} className="w-4 h-4">{WebI.flame}</span>
        <div className="leading-tight">
          <div className="text-[11.5px]" style={{ color: 'var(--ink)' }}>
            {j ? `${j.days}-day streak` : '—'}
          </div>
          <div className="text-[9.5px]" style={{ color: 'var(--muted)' }}>
            {j ? `${j.conversations} conversations` : 'Loading…'}
          </div>
        </div>
      </div>

      {/* Nav links */}
      <div className="px-2.5 flex-1">
        {items.map((item) =>
        item.href.startsWith('/') ? (
        <Link key={item.id} to={item.href}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition no-underline"
        style={{
          background: activeTop === item.id ? 'var(--surface)' : 'transparent',
          color: activeTop === item.id ? 'var(--ink)' : 'var(--ink-2)',
          border: activeTop === item.id ? '1px solid var(--hairline)' : '1px solid transparent'
        }}>
            <span className="w-4 h-4">{item.icon}</span>
            <span className="text-[13px]" style={{ fontWeight: activeTop === item.id ? 500 : 400 }}>
              {item.label}
            </span>
          </Link>
        ) : (
        <a key={item.id} href="#" onClick={(e) => e.preventDefault()}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition no-underline"
        style={{
          background: activeTop === item.id ? 'var(--surface)' : 'transparent',
          color: activeTop === item.id ? 'var(--ink)' : 'var(--ink-2)',
          border: activeTop === item.id ? '1px solid var(--hairline)' : '1px solid transparent'
        }}>
            <span className="w-4 h-4">{item.icon}</span>
            <span className="text-[13px]" style={{ fontWeight: activeTop === item.id ? 500 : 400 }}>
              {item.label}
            </span>
          </a>
        )
        )}
      </div>

      {/* User footer */}
      <div className="px-4 py-3 flex items-center gap-2.5"
      style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-medium"
        style={{ background: 'oklch(0.92 0.04 110)', color: 'oklch(0.38 0.08 110)' }}>
          Y
        </div>
        <div className="leading-tight flex-1 min-w-0">
          <div className="text-[12px] font-medium truncate">You · 你</div>
          <div className="text-[9.5px] font-mono" style={{ color: 'var(--muted)' }}>
            EN ← 中文 · B1
          </div>
        </div>
      </div>
    </nav>);

}

// Conversations sub-rail (used in chat views)
export function WebConversationsRail({ npcs = [], activeId, onSelect, intense }: { npcs?: any[]; activeId?: string; onSelect?: (id: string) => void; intense?: boolean }) {
  return (
    <div className="pane-nav h-full flex flex-col chat-bg"
    style={{ background: intense ? 'var(--bg-warm-c)' : 'var(--bg-warm)',
      borderRight: intense ? '1px solid var(--hairline-c)' : '1px solid var(--hairline-2)' }}>
      {/* Brand row */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
        <div className="rounded-lg grid place-items-center"
        style={{ width: 30, height: 30, background: 'var(--brand-bg)', color: 'var(--brand-ink)' }}>
          <span style={{ fontWeight: 700, fontSize: 16, lineHeight: 1 }}>P</span>
        </div>
        <div className="leading-tight">
          <div className="font-serif text-[17px]" style={{ fontFamily: "Outfit" }}>Popcorn</div>
          <div className="text-[9.5px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
            Language
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }}>
            {WebI.search}
          </span>
          <input placeholder="Search…"
          className="w-full pl-9 pr-3 py-2 rounded-lg text-[12.5px] outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }} />
        </div>
      </div>

      {/* Section label */}
      <div className="px-5 pt-3 pb-1.5 flex items-center justify-between">
        <span className="text-[9.5px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
          Recent · 最近
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {npcs.map((npc) =>
        <button key={npc.id} onClick={() => onSelect && onSelect(npc.id)}
        className="w-full flex items-start gap-2.5 px-2.5 py-2.5 rounded-lg transition text-left mb-0.5"
        style={{
          background: activeId === npc.id ? 'var(--surface)' : 'transparent',
          border: '1px solid ' + (activeId === npc.id ? 'var(--hairline)' : 'transparent')
        }}>
            <WebAvatar npc={npc} size={36} hasSomething={npc.hasSomething} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium truncate">{npc.name}</span>
                <span className="text-[9.5px] font-mono shrink-0" style={{ color: 'var(--muted)' }}>{npc.time}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <WebRelationshipDots value={npc.stageValue} size={4} />
                <span className="text-[9.5px]" style={{ color: 'var(--muted)' }}>
                  {RELATIONSHIP_LABEL[npc.relationship]}
                </span>
              </div>
              <p className="text-[11px] mt-1 leading-snug truncate" style={{ color: 'var(--ink-2)' }}>
                {npc.lastPreview}
              </p>
            </div>
          </button>
        )}
      </div>

      {/* Nav buttons */}
      <div className="px-4 py-3 flex items-center gap-2"
      style={{ borderTop: intense ? '1px solid var(--hairline-c)' : '1px solid var(--hairline)' }}>
        <Link to="/onboarding"
        className="flex-1 text-[11px] py-2 px-2.5 rounded-lg flex items-center gap-1.5 transition no-underline"
        style={{ color: 'var(--ink-2)', border: '1px solid var(--hairline)' }}>
          <span className="w-3.5 h-3.5">{WebI.book}</span> Journey
        </Link>
        <button className="text-[11px] py-2 px-2.5 rounded-lg flex items-center transition"
        style={{ color: 'var(--muted)' }}>
          <span className="w-3.5 h-3.5">{WebI.settings}</span>
        </button>
      </div>
    </div>);

}
