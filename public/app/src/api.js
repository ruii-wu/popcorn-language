// public/app/src/api.js — thin same-origin client for the Popcorn backend.
// Loaded as a plain global script (window.API) before each page's component script.
(function () {
  async function req(method, url, body) {
    const opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts); // same-origin → pop_uid cookie sent automatically
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || res.statusText;
      const err = new Error(msg);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }
  const apiGet = (u) => req('GET', u);
  const apiPost = (u, b) => req('POST', u, b === undefined ? {} : b);
  const apiPut = (u, b) => req('PUT', u, b);

  // SSE over POST: EventSource cannot POST, so read the stream manually.
  // Calls onEvent({ type, data }) per `event:`/`data:` frame.
  async function streamPost(url, body, onEvent) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      onEvent({ type: 'error', data: { code: 'NETWORK', message: String(e) } });
      return;
    }
    if (!res.ok || !res.body) {
      let data = null;
      try { data = await res.json(); } catch (e) { /* ignore */ }
      onEvent({ type: 'error', data: (data && data.error) || { code: 'HTTP_' + res.status, message: res.statusText } });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (frame.trim()) onEvent(parseFrame(frame));
      }
    }
    if (buf.trim()) onEvent(parseFrame(buf));
  }
  function parseFrame(frame) {
    let type = 'message';
    const dataLines = [];
    const lines = frame.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.indexOf('event:') === 0) type = line.slice(6).trim();
      else if (line.indexOf('data:') === 0) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    let data = null;
    const raw = dataLines.join('\n');
    if (raw) { try { data = JSON.parse(raw); } catch (e) { data = raw; } }
    return { type: type, data: data };
  }

  window.API = {
    // auth/session
    me: () => apiGet('/api/auth/me'),
    login: (username, password) => apiPost('/api/auth/login', { username: username, password: password }),
    register: (username, password) => apiPost('/api/auth/register', { username: username, password: password }),
    logout: () => apiPost('/api/auth/logout', {}),
    // chat
    npcs: () => apiGet('/api/npcs'),
    thread: (npcId, limit) => apiGet('/api/threads/' + npcId + '?limit=' + (limit || 50)),
    streamMessage: (npcId, text, onEvent) =>
      streamPost('/api/threads/' + npcId + '/messages', { text: text }, onEvent),
    // onboarding / journey / profile
    profile: () => apiGet('/api/profile'),
    saveProfile: (p) => apiPut('/api/profile', p),
    onboardingComplete: () => apiPost('/api/onboarding/complete', {}),
    journey: () => apiGet('/api/journey/summary'),
    relationships: () => apiGet('/api/journey/relationships'),
    streak: () => apiGet('/api/journey/streak'),
    achievements: () => apiGet('/api/achievements'),
    memories: () => apiGet('/api/memories'),
    settings: () => apiGet('/api/settings'),
    saveSettings: (s) => apiPut('/api/settings', s),
    // scenario
    scenarioCatalog: () => apiGet('/api/scenarios/catalog'),
    sessions: (query) => apiGet('/api/scenarios/sessions' + (query || '')),
    session: (id) => apiGet('/api/scenarios/sessions/' + id),
    acceptSession: (id) => apiPost('/api/scenarios/sessions/' + id + '/accept', {}),
    declineSession: (id, reason) =>
      apiPost('/api/scenarios/sessions/' + id + '/decline', reason ? { reason: reason } : {}),
    streamChoose: (id, choiceId, onEvent, extra) =>
      streamPost('/api/scenarios/sessions/' + id + '/choose',
        Object.assign({ choiceId: choiceId }, extra || {}), onEvent),
  };
})();
