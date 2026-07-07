import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { WebDock, WebNavRail } from '../components/shared';
import type { SettingsPatch, SettingsResponse } from '@popcorn/shared';

const MEMORY_OPTIONS = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'semantic', label: 'Semantic' },
  { value: 'summary', label: 'Summary' },
  { value: 'recency', label: 'Recency' },
] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full rounded-lg px-4 py-3 flex items-center justify-between text-left"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink)' }}
    >
      <span className="text-[13px]">{label}</span>
      <span
        className="w-10 h-6 rounded-full p-0.5 transition"
        style={{ background: checked ? 'var(--accent)' : 'var(--hairline-strong)' }}
      >
        <span
          className="block w-5 h-5 rounded-full transition"
          style={{ background: '#fff', transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </span>
    </button>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<SettingsPatch>({});
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.settings()
      .then((s) => {
        setSettings(s);
        setDraft(s);
      })
      .catch(() => setStatus('Sign in to edit settings.'));
  }, []);

  const update = <K extends keyof SettingsPatch>(key: K, value: SettingsPatch[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setStatus('');
  };

  async function save() {
    setStatus('Saving...');
    try {
      const res = await api.saveSettings(draft);
      const next = (res as { settings: SettingsResponse }).settings;
      setSettings(next);
      setDraft(next);
      setStatus('Saved');
    } catch {
      setStatus('Could not save settings.');
    }
  }

  const ready = settings && draft;

  return (
    <div className="app-shell">
      <WebNavRail activeTop="settings" />
      <section className="pane-main overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div className="max-w-[760px] mx-auto px-10 py-8">
          <span className="text-[10px] font-mono uppercase tracking-[0.22em]" style={{ color: 'var(--muted)' }}>
            settings
          </span>
          <h1 className="font-serif text-[54px] leading-none mt-2">Local model controls</h1>

          <div className="mt-8 grid gap-4">
            <Field label="Chat model">
              <input
                value={draft.modelName ?? ''}
                onChange={(e) => update('modelName', e.target.value)}
                disabled={!ready}
                className="w-full rounded-lg px-4 py-3 text-[14px] outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink)' }}
              />
            </Field>

            <Field label="Memory strategy">
              <select
                value={draft.memoryStrategy ?? 'hybrid'}
                onChange={(e) => update('memoryStrategy', e.target.value as SettingsPatch['memoryStrategy'])}
                disabled={!ready}
                className="w-full rounded-lg px-4 py-3 text-[14px] outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink)' }}
              >
                {MEMORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>

            <Toggle
              label="Grammar correction"
              checked={draft.grammarCorrection ?? true}
              onChange={(value) => update('grammarCorrection', value)}
            />
            <Toggle
              label="Show AI rationale"
              checked={draft.showAIRationale ?? true}
              onChange={(value) => update('showAIRationale', value)}
            />
          </div>

          <div className="mt-8 flex items-center justify-between">
            <span className="text-[12px]" style={{ color: status === 'Saved' ? 'var(--moss)' : 'var(--muted)' }}>
              {status || 'Changes affect the next model request.'}
            </span>
            <button
              onClick={save}
              disabled={!ready}
              className="rounded-full px-6 py-3 text-[14px] font-medium transition disabled:opacity-40"
              style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-ink)' }}
            >
              Save
            </button>
          </div>
        </div>
      </section>
      <WebDock current="Settings" />
    </div>
  );
}
