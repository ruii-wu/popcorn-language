import { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import type {
  SessionDetailResponse,
  ScenarioTranscriptItem,
  AcceptSessionResponse,
  ScenarioChoice,
  ScenarioSummary,
  ScenarioStreamEvent,
} from '@popcorn/shared';

export type ScenarioStatus = 'invited' | 'active' | 'paused' | 'completed' | null;
export interface ScenarioMessage { from: 'user' | 'npc-c' | 'system'; text: string; time?: string }
export interface HudState { impression: number; stress: string; turnsLeft: number }
export interface LiveSession {
  id: string;
  status: 'invited' | 'active' | 'paused' | 'completed';
  scenarioTitle: string;
  npcId: string;
  grade?: string | null;
}

export function choiceToTurnPayload(choice: ScenarioChoice): { text?: string; tone?: string } {
  return {
    ...(choice.text ? { text: choice.text } : {}),
    ...(choice.tone ? { tone: choice.tone } : {}),
  };
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function transcriptToMessages(transcript: ScenarioTranscriptItem[]): ScenarioMessage[] {
  return (transcript || []).map((t) => ({
    from: t.from === 'user' ? 'user' : 'npc-c',
    text: t.text,
    time: t.createdAt ? new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
  }));
}

// Owns the scenario lifecycle for ONE npc. App re-keys it by passing the active npcId.
// Casual chat is the default: an in-progress (active) session is surfaced as `resumable`
// (a banner) rather than auto-taking over the conversation. The user resumes or ends it.
export function useScenarioSession(npcId: string | null) {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [resumable, setResumable] = useState<LiveSession | null>(null);
  const [messages, setMessages] = useState<ScenarioMessage[]>([]);
  const [choices, setChoices] = useState<ScenarioChoice[]>([]);
  const [hudState, setHudState] = useState<HudState | null>(null);
  const [summary, setSummary] = useState<ScenarioSummary | null>(null);
  const [transcript, setTranscript] = useState<ScenarioTranscriptItem[]>([]);
  const [choiceDisabled, setChoiceDisabled] = useState(false);
  const [npcTyping, setNpcTyping] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [ending, setEnding] = useState(false);
  const [declinedReply, setDeclinedReply] = useState<ScenarioMessage | null>(null);

  // Guards stale stream writes after the user switches NPC mid-stream.
  const liveSidRef = useRef<string | null>(null);
  const declineSeqRef = useRef(0);
  const sessionsSeqRef = useRef(0);
  const dismissedCompletedSessionIdRef = useRef<string | null>(null);
  liveSidRef.current = session ? session.id : null;

  function refreshSessions() {
    if (!npcId) return Promise.resolve();
    const requestId = ++sessionsSeqRef.current;
    return api.sessions('?npcId=' + encodeURIComponent(npcId)).then(async (list) => {
      if (requestId !== sessionsSeqRef.current) return;
      const invited = list.find((s) => s.status === 'invited');
      const pending = list.find((s) => s.status === 'paused' || s.status === 'active');
      const completed = list.find((s) => s.status === 'completed');
      if (invited) {
        setSession({ id: invited.id, status: 'invited', scenarioTitle: invited.scenarioTitle, npcId, grade: invited.grade });
        setResumable(null);
        setSummary(null); setTranscript([]);
      } else if (pending) {
        setSession(null);
        setResumable({ id: pending.id, status: pending.status as 'active' | 'paused', scenarioTitle: pending.scenarioTitle, npcId, grade: pending.grade });
        setSummary(null); setTranscript([]);
      } else if (completed && dismissedCompletedSessionIdRef.current !== completed.id) {
        setSession({ id: completed.id, status: 'completed', scenarioTitle: completed.scenarioTitle, npcId, grade: completed.grade });
        setResumable(null);
        const detail = await api.session(completed.id);
        if (requestId !== sessionsSeqRef.current) return;
        setSummary(detail.summary);
        setTranscript(detail.transcript || []);
      } else {
        setSession(null); setResumable(null); setSummary(null); setTranscript([]);
      }
    }).catch(() => {});
  }

  useEffect(() => {
    setSession(null); setResumable(null); setMessages([]); setChoices([]); setHudState(null);
    setSummary(null); setTranscript([]); setChoiceDisabled(false); setNpcTyping(false); setAccepting(false);
    setDeclining(false); setPausing(false); setResuming(false); setEnding(false); setDeclinedReply(null);
    declineSeqRef.current += 1;
    dismissedCompletedSessionIdRef.current = null;
    if (!npcId) return;
    refreshSessions();
    return () => { sessionsSeqRef.current += 1; };
  }, [npcId]);

  // Shared SSE handler for choose/freetype turns.
  function turnHandler(sid: string) {
    return (event: ScenarioStreamEvent) => {
      if (liveSidRef.current !== sid) return; // stale: user switched NPC / ended
      if (event.type === 'typing_start') setNpcTyping(true);
      else if (event.type === 'typing_end') setNpcTyping(false);
      else if (event.type === 'message_complete') {
        setNpcTyping(false);
        setMessages((prev) => prev.concat({ from: 'npc-c', text: event.data.fullText, time: nowTime() }));
      } else if (event.type === 'state_update') {
        setHudState({ impression: event.data.impression, stress: event.data.stress, turnsLeft: event.data.turnsLeft });
      } else if (event.type === 'choices') {
        setChoices(event.data.choices); setChoiceDisabled(false);
      } else if (event.type === 'scenario_end') {
        dismissedCompletedSessionIdRef.current = null;
        setSummary(event.data.summary); setChoices([]); setChoiceDisabled(false);
        setSession((prev) => prev ? { ...prev, status: 'completed', grade: event.data.summary.grade } : prev);
      } else if (event.type === 'error') {
        setNpcTyping(false); setChoiceDisabled(false);
        setMessages((prev) => prev.concat({ from: 'system', text: 'Connection error — please try again.' }));
      }
    };
  }

  // Called by App when a scenario_offer arrives on the chat stream.
  function offerSession(sessionId: string, title: string) {
    if (!npcId) return;
    setSummary(null); setMessages([]); setChoices([]); setHudState(null); setResumable(null);
    setAccepting(false); setDeclining(false); setEnding(false); setDeclinedReply(null);
    setSession({ id: sessionId, status: 'invited', scenarioTitle: title, npcId });
  }

  function accept() {
    if (!session || accepting || choiceDisabled) return;
    const sid = session.id;
    setAccepting(true);
    setChoiceDisabled(true);
    api.acceptSession(sid).then((result: AcceptSessionResponse) => {
      if (liveSidRef.current !== sid) return;
      setSession((prev) => prev ? { ...prev, status: 'active' } : prev);
      if (result.openingMessage) setMessages([{ from: 'npc-c', text: result.openingMessage.text, time: nowTime() }]);
      if (result.choices) setChoices(result.choices);
      if (result.state) setHudState(result.state as HudState);
      setAccepting(false);
      setChoiceDisabled(false);
    }).catch(() => {
      if (liveSidRef.current !== sid) return;
      setAccepting(false);
      setChoiceDisabled(false);
      setMessages((prev) => prev.concat({ from: 'system', text: 'Could not start the scenario. Please try again.' }));
    });
  }

  function decline() {
    if (!session || accepting || declining) return;
    const requestId = ++declineSeqRef.current;
    setDeclining(true);
    setNpcTyping(true);
    setChoices([]);
    setSession(null);
    api.streamDeclineSession(session.id, undefined, (event) => {
      if (declineSeqRef.current !== requestId) return;
      if (event.type === 'typing_start') setNpcTyping(true);
      else if (event.type === 'typing_end') setNpcTyping(false);
      else if (event.type === 'message_complete') {
        setNpcTyping(false);
        setDeclinedReply({ from: 'npc-c', text: event.data.fullText, time: nowTime() });
      } else if (event.type === 'error') {
        setNpcTyping(false);
        setDeclinedReply({ from: 'system', text: 'Could not continue the chat. Please try again.' });
      } else if (event.type === 'done') {
        setNpcTyping(false);
        setDeclining(false);
      }
    }).catch(() => {
      if (declineSeqRef.current !== requestId) return;
      setNpcTyping(false);
      setDeclining(false);
      setDeclinedReply({ from: 'system', text: 'Could not continue the chat. Please try again.' });
    });
  }

  async function pause() {
    if (!session || session.status !== 'active' || choiceDisabled || pausing) return;
    const current = session;
    setPausing(true);
    try {
      await api.pauseSession(current.id);
      if (liveSidRef.current !== current.id) return;
      setResumable({ ...current, status: 'paused' });
      setSession(null);
      setMessages([]); setChoices([]); setHudState(null); setSummary(null); setTranscript([]);
    } catch {
      if (liveSidRef.current === current.id) {
        setMessages((prev) => prev.concat({ from: 'system', text: 'Could not pause the scenario. Please try again.' }));
      }
    } finally {
      setPausing(false);
    }
  }

  // Enter an in-progress scenario from the resume banner and restore its persisted turn.
  async function resume() {
    const r = resumable;
    if (!r || resuming) return;
    const requestId = ++sessionsSeqRef.current;
    setResuming(true);
    try {
      if (r.status === 'paused') {
        await api.resumeSession(r.id);
        if (requestId !== sessionsSeqRef.current) return;
        setResumable({ ...r, status: 'active' });
      }
      const detail: SessionDetailResponse = await api.session(r.id);
      if (requestId !== sessionsSeqRef.current) return;
      setSession({ ...r, status: 'active' });
      setResumable(null);
      setTranscript(detail.transcript || []);
      setMessages(transcriptToMessages(detail.transcript || []));
      setChoices(detail.choices || []);
      if (detail.state) setHudState(detail.state as HudState);
    } catch {
      if (requestId === sessionsSeqRef.current) setResuming(false);
      return;
    }
    if (requestId === sessionsSeqRef.current) setResuming(false);
  }

  // Leave/end a scenario — aborts it server-side and returns to casual chat.
  async function abort() {
    const current = session || resumable;
    if (!current || ending) return;
    const confirmed = window.confirm(
      'End this scenario? Your saved progress will be closed and cannot be resumed. Use Pause if you want to continue later.',
    );
    if (!confirmed) return;
    const requestId = ++sessionsSeqRef.current;
    setEnding(true);
    try {
      await api.abortSession(current.id);
      if (requestId !== sessionsSeqRef.current) return;
      setSession(null); setResumable(null); setMessages([]); setChoices([]); setHudState(null); setSummary(null); setTranscript([]);
    } catch {
      if (requestId === sessionsSeqRef.current) {
        window.alert('Could not end the scenario. Please try again.');
      }
    } finally {
      if (requestId === sessionsSeqRef.current) setEnding(false);
    }
  }

  function clearForRecall() {
    setSession(null); setResumable(null); setMessages([]); setChoices([]); setHudState(null); setSummary(null);
    setTranscript([]); setNpcTyping(false); setEnding(false); setDeclinedReply(null);
  }

  // A completed Scenario is already persisted. Leaving its summary only changes the current
  // chat view; the result remains available from Journey and can be restored after reload.
  function continueChatting() {
    if (session?.status !== 'completed') return;
    dismissedCompletedSessionIdRef.current = session.id;
    setSession(null); setResumable(null); setMessages([]); setChoices([]); setHudState(null); setSummary(null);
    setTranscript([]); setNpcTyping(false); setChoiceDisabled(false); setEnding(false);
  }

  function choose(choice: ScenarioChoice) {
    if (!session || choiceDisabled) return;
    const sid = session.id;
    setChoiceDisabled(true);
    setChoices([]);
    setMessages((prev) => prev.concat({ from: 'user', text: choice.text, time: nowTime() }));
    api.streamChoose(sid, choice.id, turnHandler(sid), choiceToTurnPayload(choice));
  }

  function freetype(text: string) {
    if (!session || choiceDisabled || !text.trim()) return;
    const sid = session.id;
    setChoiceDisabled(true);
    setChoices([]); // typing freely supersedes the stale choice cards
    setMessages((prev) => prev.concat({ from: 'user', text, time: nowTime() }));
    api.streamFreetype(sid, text, turnHandler(sid));
  }

  const status: ScenarioStatus = session ? session.status : null;
  return {
    session, status, resumable, messages, choices, hudState, summary, transcript,
    choiceDisabled, accepting, declining, pausing, resuming, ending, declinedReply, npcTyping,
    offerSession, accept, decline, pause, resume, abort,
    clearForRecall, continueChatting, refreshSessions, choose, freetype,
  };
}
