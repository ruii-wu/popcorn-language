import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { WebI, WebNavRail } from '../components/shared';
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
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<SettingsPatch>({});
  const [status, setStatus] = useState('');
  const [resetStatus, setResetStatus] = useState('');
  const [resetting, setResetting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setStatus('Logging out...');
    try {
      await api.logout();
      navigate('/onboarding', { replace: true });
    } catch {
      setLoggingOut(false);
      setStatus('Could not log out.');
    }
  }

  async function resetChatHistory() {
    if (resetting) return;
    const confirmed = window.confirm(
      'Reset all chat history? This also clears scenarios, memories, achievements, and relationship progress. This cannot be undone.',
    );
    if (!confirmed) return;

    setResetting(true);
    setResetStatus('Resetting chat history...');
    try {
      await api.resetUserData();
      await api.onboardingComplete();
      navigate('/', { replace: true });
    } catch {
      setResetting(false);
      setResetStatus('Could not reset chat history.');
    }
  }

  const ready = settings && draft;

  return (
    <div className="app-shell">
      <WebNavRail activeTop="settings" />
      <section className="pane-main pane-main-scroll" style={{ background: 'var(--bg)' }}>
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

          <section className="mt-10 pt-7 flex items-center justify-between gap-6"
                   style={{ borderTop: '1px solid var(--hairline)' }}>
            <div>
              <h2 className="text-[14px] font-medium">Reset chat history</h2>
              <p className="text-[12px] mt-1 max-w-[460px]" style={{ color: 'var(--muted)' }}>
                Clear conversations, scenarios, memories, achievements, and relationship progress. Your account, profile, and settings stay intact.
              </p>
              {resetStatus && (
                <p className="text-[11px] mt-2" style={{ color: 'var(--coral-ink)' }}>{resetStatus}</p>
              )}
            </div>
            <button
              type="button"
              onClick={resetChatHistory}
              disabled={resetting || loggingOut}
              className="shrink-0 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition disabled:opacity-40"
              style={{ background: 'var(--coral-soft)', border: '1px solid var(--hairline-strong)', color: 'var(--coral-ink)' }}
            >
              <span className="w-4 h-4">{WebI.reset}</span>
              {resetting ? 'Resetting...' : 'Reset history'}
            </button>
          </section>

          <section className="mt-7 pt-7 flex items-center justify-between gap-6"
                   style={{ borderTop: '1px solid var(--hairline)' }}>
            <div>
              <h2 className="text-[14px] font-medium">Account</h2>
              <p className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>
                End this session and return to sign in.
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut || resetting}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition disabled:opacity-40"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline-strong)', color: 'var(--ink)' }}
            >
              <span className="w-4 h-4">{WebI.logout}</span>
              {loggingOut ? 'Logging out...' : 'Log out'}
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}
