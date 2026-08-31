// Shared design primitives for the web UI variant.
// Ported from public/app/src/shared.jsx — faithful ES-module + TypeScript translation.

import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { NpcListItem } from '@popcorn/shared';

// API NpcListItem → the flat view-model the avatar/header components consume.
export function npcView(item: NpcListItem) {
  return {
    id: item.id,
    name: item.name,
    avatarGlyph: item.avatar ? item.avatar.glyph : '?',
    avatarBg: item.avatar ? item.avatar.bg : 'var(--surface-2)',
    avatarInk: item.avatar ? item.avatar.ink : 'var(--ink)',
    relationship: item.relationship,
    stageValue: item.stageValue,
    status: item.status || '',
    lastPreview: item.lastMessage || '',
    time: item.lastTime ? new Date(item.lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    hasSomething: !!item.hasSomething,
  };
}

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
  recall: <Icon d={<><path d="M9 7 4 12l5 5" /><path d="M4 12h9a6 6 0 1 1-4.2 10.2" /></>} />,
  reset: <Icon d={<><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v5c0 1.7 3.1 3 7 3 1.2 0 2.3-.1 3.2-.4" /><path d="M5 10v5c0 1.7 3.1 3 7 3" /><path d="m17 15 3 3-3 3" /><path d="M20 18h-5" /></>} />,
  logout: <Icon d={<><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></>} />,
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

export const RELATIONSHIP_LABEL: Record<string, string> = {
  acquaintance: 'Acquaintance',
  friend: 'Friend',
  close: 'Close friend'
};

export function filterConversations(npcs: any[], query: string): any[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return npcs;
  return npcs.filter((npc) => [
    npc.name,
    npc.lastPreview,
    RELATIONSHIP_LABEL[npc.relationship],
  ].some((value) => String(value || '').toLocaleLowerCase().includes(normalized)));
}

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

type WebPrimaryDestination = 'chats' | 'journey' | 'settings';

const PRIMARY_NAV_ITEMS = [
  { id: 'chats', label: 'Chats', icon: WebI.msgs, href: '/' },
  { id: 'journey', label: 'Journey', icon: WebI.book, href: '/onboarding' },
  { id: 'settings', label: 'Settings', icon: WebI.settings, href: '/settings' },
] as const;

function WebPrimaryNav({ active }: { active: WebPrimaryDestination }) {
  return (
    <nav aria-label="Primary navigation" className="grid grid-cols-3 gap-1 px-3 py-3"
         style={{ borderTop: '1px solid var(--hairline)' }}>
      {PRIMARY_NAV_ITEMS.map((item) => {
        const selected = active === item.id;
        return (
          <Link key={item.id} to={item.href} aria-current={selected ? 'page' : undefined}
                className="min-w-0 rounded-lg py-2 flex flex-col items-center justify-center gap-1 transition no-underline"
                style={{
                  minHeight: 50,
                  background: selected ? 'var(--surface)' : 'transparent',
                  color: selected ? 'var(--ink)' : 'var(--muted)',
                  border: `1px solid ${selected ? 'var(--hairline)' : 'transparent'}`,
                }}>
            <span className="w-4 h-4">{item.icon}</span>
            <span className="text-[9.5px] leading-none truncate max-w-full">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function WebSidebarBrand() {
  return (
    <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
      <div className="rounded-lg grid place-items-center"
           style={{ width: 30, height: 30, background: 'var(--brand-bg)', color: 'var(--brand-ink)' }}>
        <span style={{ fontWeight: 700, fontSize: 16, lineHeight: 1 }}>P</span>
      </div>
      <div className="leading-tight">
        <div className="font-serif text-[17px]" style={{ fontFamily: 'Outfit' }}>Popcorn</div>
        <div className="text-[9.5px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
          Language
        </div>
      </div>
    </div>
  );
}

export interface WebSectionNavItem {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
}

export function filterSectionNavItems(items: WebSectionNavItem[], query: string): WebSectionNavItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return items;
  return items.filter((item) => [item.label, item.description]
    .some((value) => value.toLocaleLowerCase().includes(normalized)));
}

function WebSidebarSearch({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="px-4 pb-2">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }}>
          {WebI.search}
        </span>
        <input placeholder="Search…" aria-label={ariaLabel} autoComplete="off"
               value={value} onChange={(event) => onChange(event.target.value)}
               className="w-full pl-9 pr-8 py-2 rounded-lg text-[12.5px] outline-none"
               style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }} />
        {value && (
          <button type="button" title="Clear search" aria-label="Clear search"
                  onClick={() => onChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded-full transition hover:bg-[var(--bg-warm)]"
                  style={{ color: 'var(--muted)' }}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// Journey and Settings use this rail for their page-specific tabs.
export function WebNavRail({
  activeTop,
  sectionLabel,
  items,
  activeItem,
  onSelectItem,
}: {
  activeTop: Exclude<WebPrimaryDestination, 'chats'>;
  sectionLabel: string;
  items: WebSectionNavItem[];
  activeItem: string;
  onSelectItem: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const visibleItems = filterSectionNavItems(items, query);

  return (
    <aside className="pane-nav h-full flex flex-col chat-bg"
           style={{ background: 'var(--bg-warm)', borderRight: '1px solid var(--hairline-2)' }}>
      <WebSidebarBrand />
      <WebSidebarSearch value={query} onChange={setQuery} ariaLabel={`Search ${sectionLabel} sections`} />
      <div className="px-4 pt-3">
        <div className="px-1 pb-1.5 text-[9.5px] font-mono uppercase tracking-[0.18em]"
             style={{ color: 'var(--muted)' }}>
          {sectionLabel}
        </div>
        <div role="tablist" aria-label={`${sectionLabel} sections`} aria-orientation="vertical" className="grid gap-1">
          {visibleItems.map((item) => {
            const selected = activeItem === item.id;
            return (
              <button key={item.id} type="button" role="tab"
                      id={`${activeTop}-tab-${item.id}`}
                      aria-selected={selected}
                      aria-controls={`${activeTop}-panel-${item.id}`}
                      onClick={() => onSelectItem(item.id)}
                      className="w-full rounded-lg px-3 py-2.5 flex items-center gap-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plum)]"
                      style={{
                        background: selected ? 'var(--surface)' : 'transparent',
                        border: `1px solid ${selected ? 'var(--hairline)' : 'transparent'}`,
                        color: selected ? 'var(--ink)' : 'var(--ink-2)',
                      }}>
                <span className="w-4 h-4 shrink-0" style={{ color: selected ? 'var(--accent-ink)' : 'var(--muted)' }}>
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium truncate">{item.label}</span>
                  <span className="block mt-0.5 text-[9.5px] truncate" style={{ color: 'var(--muted)' }}>
                    {item.description}
                  </span>
                </span>
                {selected && <span aria-hidden="true" className="w-3.5 h-3.5 shrink-0">{WebI.chevR}</span>}
              </button>
            );
          })}
        </div>
        {visibleItems.length === 0 && (
          <div className="px-2 py-8 text-center text-[11px]" style={{ color: 'var(--muted)' }}>
            No sections found
          </div>
        )}
      </div>
      <div className="flex-1" />
      <WebPrimaryNav active={activeTop} />
    </aside>
  );
}

// Conversations sub-rail (used in chat views)
export function WebConversationsRail({
  npcs = [],
  activeId,
  activeTop = 'chats',
  onSelect,
  intense,
}: {
  npcs?: any[];
  activeId?: string;
  activeTop?: WebPrimaryDestination;
  onSelect?: (id: string) => void;
  intense?: boolean;
}) {
  const [query, setQuery] = useState('');
  const visibleNpcs = filterConversations(npcs, query);

  return (
    <div className="pane-nav h-full flex flex-col chat-bg"
    style={{ background: intense ? 'var(--bg-warm-c)' : 'var(--bg-warm)',
      borderRight: intense ? '1px solid var(--hairline-c)' : '1px solid var(--hairline-2)' }}>
      <WebSidebarBrand />
      <WebSidebarSearch value={query} onChange={setQuery} ariaLabel="Search conversations" />

      {/* Section label */}
      <div className="px-5 pt-3 pb-1.5 flex items-center justify-between">
        <span className="text-[9.5px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
          Recent · 最近
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {visibleNpcs.map((npc) =>
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
        {visibleNpcs.length === 0 && (
          <div className="px-3 py-8 text-center text-[11px]" style={{ color: 'var(--muted)' }}>
            No conversations found
          </div>
        )}
      </div>

      <WebPrimaryNav active={activeTop} />
    </div>);

}
