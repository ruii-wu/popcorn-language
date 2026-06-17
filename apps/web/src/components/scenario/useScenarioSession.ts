import { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import type {
  SessionDetailResponse,
  ScenarioTranscriptItem,
  AcceptSessionResponse,
  ScenarioChoice,
  ScenarioSummary,
} from '@popcorn/shared';

export type ScenarioStatus = 'invited' | 'active' | 'completed' | null;
export interface ScenarioMessage { from: 'user' | 'npc-c' | 'system'; text: string; time?: string }
export interface HudState { impression: number; stress: string; turnsLeft: number }
export interface LiveSession {
  id: string;
  status: 'invited' | 'active' | 'completed';
  scenarioTitle: string;
  npcId: string;
  grade?: string | null;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Owns the scenario lifecycle for ONE npc. App re-keys it by passing the active npcId;
// switching NPC resets state and reloads that NPC's live session (resume in-progress play).
export function useScenarioSession(npcId: string | null) {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [messages, setMessages] = useState<ScenarioMessage[]>([]);
  const [choices, setChoices] = useState<ScenarioChoice[]>([]);
  const [hudState, setHudState] = useState<HudState | null>(null);
  const [summary, setSummary] = useState<ScenarioSummary | null>(null);
  const [transcript, setTranscript] = useState<ScenarioTranscriptItem[]>([]);
  const [choiceDisabled, setChoiceDisabled] = useState(false);
  const [npcTyping, setNpcTyping] = useState(false);

  // Guards stale stream writes after the user switches NPC mid-stream.
  const liveSidRef = useRef<string | null>(null);
  liveSidRef.current = session ? session.id : null;

  useEffect(() => {
    setSession(null); setMessages([]); setChoices([]); setHudState(null);
    setSummary(null); setTranscript([]); setChoiceDisabled(false); setNpcTyping(false);
    if (!npcId) return;
    let cancelled = false;
    api.sessions().then((list) => {
      if (cancelled) return;
      const mine = list.filter((s) => s.npcId === npcId);
      const picked = mine.find((s) => s.status === 'active')
                   || mine.find((s) => s.status === 'invited')
                   || mine.find((s) => s.status === 'completed')
                   || null;
      if (!picked) return;
      setSession({ id: picked.id, status: picked.status as LiveSession['status'],
        scenarioTitle: picked.scenarioTitle, npcId, grade: picked.grade });
      if (picked.status === 'active' || picked.status === 'completed') {
        api.session(picked.id).then((detail: SessionDetailResponse) => {
          if (cancelled) return;
          setTranscript(detail.transcript || []);
          if (detail.state) setHudState(detail.state as HudState);
          if (picked.status === 'active') {
            setMessages((detail.transcript || []).map((t: ScenarioTranscriptItem) => ({
              from: t.from === 'user' ? 'user' : 'npc-c',
              text: t.text,
              time: t.createdAt ? new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            })));
          }
        }).catch(() => {});
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [npcId]);

  // Called by App when a scenario_offer arrives on the chat stream.
  function offerSession(sessionId: string, title: string) {
    if (!npcId) return;
    setSummary(null); setMessages([]); setChoices([]); setHudState(null);
    setSession({ id: sessionId, status: 'invited', scenarioTitle: title, npcId });
  }

  function accept() {
    if (!session) return;
    const sid = session.id;
    setChoiceDisabled(true);
    api.acceptSession(sid).then((result: AcceptSessionResponse) => {
      if (liveSidRef.current !== sid) return;
      setSession((prev) => prev ? { ...prev, status: 'active' } : prev);
      if (result.openingMessage) setMessages([{ from: 'npc-c', text: result.openingMessage.text, time: nowTime() }]);
      if (result.choices) setChoices(result.choices as ScenarioChoice[]);
      if (result.state) setHudState(result.state as HudState);
      setChoiceDisabled(false);
    }).catch(() => setChoiceDisabled(false));
  }

  function decline() {
    if (!session) return;
    api.declineSession(session.id).then(() => setSession(null)).catch(() => {});
  }

  function choose(choice: ScenarioChoice) {
    if (!session || choiceDisabled) return;
    const sid = session.id;
    setChoiceDisabled(true);
    setMessages((prev) => prev.concat({ from: 'user', text: choice.text, time: nowTime() }));
    api.streamChoose(sid, choice.id, (event) => {
      if (liveSidRef.current !== sid) return; // stale: user switched NPC
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
        setSummary(event.data.summary); setChoices([]); setChoiceDisabled(false);
        setSession((prev) => prev ? { ...prev, status: 'completed', grade: event.data.summary.grade } : prev);
      } else if (event.type === 'error') {
        setNpcTyping(false); setChoiceDisabled(false);
        setMessages((prev) => prev.concat({ from: 'system', text: 'Connection error — please try again.' }));
      }
    });
  }

  const status: ScenarioStatus = session ? session.status : null;
  return {
    session, status, messages, choices, hudState, summary, transcript,
    choiceDisabled, npcTyping, offerSession, accept, decline, choose,
  };
}
