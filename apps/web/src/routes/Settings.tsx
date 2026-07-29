import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { WebI, WebNavRail } from '../components/shared';
import {
  mergeProfileOptions,
  PROFILE_GOALS,
  PROFILE_INTERESTS,
  PROFILE_ROLES,
  sameProfileOption,
  toggleProfileInterest,
} from '../profileOptions';
import type { ProfileBody, SettingsPatch, SettingsResponse } from '@popcorn/shared';

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

function ChoiceButton({
  label,
  selected,
  onClick,
  disabled,
}: {
  label: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium transition disabled:opacity-40"
      style={{
        background: selected ? 'var(--accent)' : 'var(--surface)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--hairline)'}`,
        color: selected ? 'var(--btn-primary-ink)' : 'var(--ink-2)',
      }}
    >
      {label}
    </button>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<SettingsPatch>({});
  const [profileDraft, setProfileDraft] = useState<ProfileBody | null>(null);
  const [status, setStatus] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [resetStatus, setResetStatus] = useState('');
  const [resetting, setResetting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    api.settings()
      .then((nextSettings) => {
        setSettings(nextSettings);
        setDraft(nextSettings);
      })
      .catch(() => setStatus('Sign in to edit settings.'));

    api.profile()
      .then((nextProfile) => {
        setProfileDraft({
          role: nextProfile.role,
          goal: nextProfile.goal,
          interests: nextProfile.interests,
        });
      })
      .catch(() => setProfileStatus('Could not load your learning profile.'));
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

  const updateProfile = <K extends keyof ProfileBody>(key: K, value: ProfileBody[K]) => {
    setProfileDraft((current) => current ? { ...current, [key]: value } : current);
    setProfileStatus('');
  };

  async function saveProfile() {
    if (!profileDraft || savingProfile || profileDraft.interests.length < 3) return;
    setSavingProfile(true);
    setProfileStatus('Saving...');
    try {
      await api.saveProfile(profileDraft);
      const next = await api.profile();
      setProfileDraft({ role: next.role, goal: next.goal, interests: next.interests });
      setProfileStatus('Saved');
    } catch {
      setProfileStatus('Could not save your learning profile.');
    } finally {
      setSavingProfile(false);
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

  const ready = !!settings;
  const profileReady = !!profileDraft;
  const roleOptions = mergeProfileOptions(
    PROFILE_ROLES,
    profileDraft?.role ? [profileDraft.role] : [],
  );
  const interestOptions = mergeProfileOptions(
    PROFILE_INTERESTS,
    profileDraft?.interests ?? [],
  );
  const goalOptions = profileDraft?.goal
    && !PROFILE_GOALS.some((goal) => goal.id === profileDraft.goal)
    ? [...PROFILE_GOALS, { id: profileDraft.goal, label: profileDraft.goal, zh: '' }]
    : [...PROFILE_GOALS];
  const profileValid = profileDraft
    && profileDraft.interests.length >= 3
    && profileDraft.interests.length <= 5;

  return (
    <div className="app-shell">
      <WebNavRail activeTop="settings" />
      <section className="pane-main pane-main-scroll" style={{ background: 'var(--bg)' }}>
        <div className="max-w-[760px] mx-auto px-10 py-8">
          <span className="text-[10px] font-mono uppercase tracking-[0.22em]" style={{ color: 'var(--muted)' }}>
            settings
          </span>
          <h1 className="font-serif text-[54px] leading-none mt-2">Settings</h1>

          <section className="mt-9">
            <div className="flex items-start justify-between gap-6">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
                  learning profile
                </span>
                <h2 className="text-[20px] font-medium mt-1">About you</h2>
                <p className="text-[12.5px] mt-1 max-w-[560px]" style={{ color: 'var(--muted)' }}>
                  NPCs use your role, learning goal, and interests to make conversations more relevant.
                </p>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider shrink-0" style={{ color: 'var(--muted)' }}>
                editable anytime
              </span>
            </div>

            <fieldset className="mt-6">
              <legend className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
                I am a
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {roleOptions.map((role) => (
                  <ChoiceButton
                    key={role}
                    label={role}
                    selected={sameProfileOption(profileDraft?.role, role)}
                    onClick={() => updateProfile('role', role)}
                    disabled={!profileReady || savingProfile}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
                Learning English for
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {goalOptions.map((goal) => (
                  <ChoiceButton
                    key={goal.id}
                    label={<>{goal.label}{goal.zh ? <span className="ml-1.5 opacity-60">{goal.zh}</span> : null}</>}
                    selected={profileDraft?.goal === goal.id}
                    onClick={() => updateProfile('goal', goal.id)}
                    disabled={!profileReady || savingProfile}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
                Interests
              </legend>
              <div className="-mt-3 flex justify-end">
                <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>
                  Pick 3 to 5 · {profileDraft?.interests.length ?? 0} selected
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {interestOptions.map((interest) => {
                  const selected = profileDraft?.interests.some((value) => sameProfileOption(value, interest)) ?? false;
                  return (
                    <ChoiceButton
                      key={interest}
                      label={interest}
                      selected={selected}
                      onClick={() => updateProfile(
                        'interests',
                        toggleProfileInterest(profileDraft?.interests ?? [], interest),
                      )}
                      disabled={!profileReady || savingProfile || (!selected && (profileDraft?.interests.length ?? 0) >= 5)}
                    />
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-6 flex items-center justify-between gap-6">
              <span
                aria-live="polite"
                className="text-[12px]"
                style={{ color: profileStatus === 'Saved' ? 'var(--moss)' : 'var(--muted)' }}
              >
                {profileStatus || (profileValid ? 'Changes affect future conversations.' : 'Choose 3 to 5 interests.')}
              </span>
              <button
                type="button"
                onClick={saveProfile}
                disabled={!profileReady || !profileValid || savingProfile}
                className="rounded-lg px-5 py-2.5 text-[13px] font-medium transition disabled:opacity-40"
                style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-ink)' }}
              >
                {savingProfile ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          </section>

          <section className="mt-10 pt-8" style={{ borderTop: '1px solid var(--hairline)' }}>
            <span className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
              local AI
            </span>
            <h2 className="text-[20px] font-medium mt-1">Model and memory</h2>

            <div className="mt-6 grid gap-4">
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

            <div className="mt-7 flex items-center justify-between">
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
          </section>

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
