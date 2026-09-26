/**
 * AI Chat Export — service worker
 * Relais réseau : les scripts de contenu ne peuvent pas contourner le CORS
 * depuis Chrome 85. Deux relais :
 *  - COPEX_PAGE_FETCH : exécute le fetch dans le MONDE DE LA PAGE (même
 *    origine que les appels légitimes du site — requis quand l'API vérifie
 *    l'origine) ;
 *  - COPEX_FETCH : fetch direct depuis le service worker (host_permissions).
 * Le jeton reste dans le navigateur ; la requête ne va que vers Microsoft.
 */

const PAGE_FETCH_FUNC = async (url, headers) => {
  try {
    const res = await fetch(url, { headers, credentials: 'include' });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch (e) {
    return { ok: false, status: 0, error: String((e && e.message) || e) };
  }
};

const REACT_SCAN_FUNC = () => {
  const results = [];
  const seenJson = new Set();
  const score = (arr) => {
    if (!Array.isArray(arr) || arr.length < 2) return 0;
    let roleish = 0;
    let textish = 0;
    for (const m of arr.slice(0, 60)) {
      if (!m || typeof m !== 'object') return 0;
      const role = m.author || m.sender || m.role || m.from;
      const txt = m.text || m.content || m.parts || m.message;
      if (['user', 'human', 'assistant', 'ai', 'copilot', 'model', 'bot'].includes(role)) roleish++;
      if (typeof txt === 'string' || Array.isArray(txt) || (txt && typeof txt === 'object')) textish++;
    }
    if (roleish >= 1 && textish >= Math.ceil(arr.length / 2)) return arr.length;
    return 0;
  };
  const pushCandidate = (arr) => {
    if (results.length >= 3) return;
    try {
      const json = JSON.stringify(arr, (k, v) =>
        (typeof v === 'string' && v.length > 400000 ? v.slice(0, 400000) : v));
      if (!seenJson.has(json)) { seenJson.add(json); results.push(json); }
    } catch (_) { /* non sérialisable */ }
  };
  const scanValue = (v, depth) => {
    if (!v || depth > 5 || results.length >= 3) return;
    if (Array.isArray(v)) {
      if (score(v) > 0) pushCandidate(v);
      for (const it of v.slice(0, 80)) scanValue(it, depth + 1);
      return;
    }
    if (typeof v === 'object') {
      for (const k of Object.keys(v).slice(0, 30)) {
        if (k === 'ref' || k === 'children' || k[0] === '_') continue;
        try { scanValue(v[k], depth + 1); } catch (_) { /* propriété protégée */ }
      }
    }
  };
  const roots = [document.getElementById('root'), document.body, document.querySelector('main')]
    .filter(Boolean);
  for (const el of roots) {
    for (const key of Object.keys(el)) {
      if (!key.startsWith('__reactContainer$') && !key.startsWith('__reactFiber$') &&
          !key.startsWith('__reactInternalInstance$')) continue;
      const visited = new Set();
      const stack = [el[key]];
      let hops = 0;
      while (stack.length > 0 && hops++ < 2500 && results.length < 3) {
        const node = stack.pop();
        if (!node || typeof node !== 'object' || visited.has(node)) continue;
        visited.add(node);
        if (node.memoizedProps) scanValue(node.memoizedProps, 0);
        if (node.memoizedState) scanValue(node.memoizedState, 0);
        if (node.child) stack.push(node.child);
        if (node.sibling) stack.push(node.sibling);
      }
    }
  }
  try {
    for (const k of Object.keys(window).slice(0, 600)) {
      if (results.length >= 3) break;
      if (/state|store|initial/i.test(k)) {
        try { scanValue(window[k], 0); } catch (_) { /* inaccessible */ }
      }
    }
  } catch (_) { /* enumeration bloquee */ }
  return { candidates: results };
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'COPEX_REACT_SCAN') {
    (async () => {
      try {
        if (!sender.tab || !sender.tab.id) {
          sendResponse({ candidates: [], error: 'no-tab' });
          return;
        }
        const results = await chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          world: 'MAIN',
          func: REACT_SCAN_FUNC
        });
        const result = results && results[0] && results[0].result;
        sendResponse(result || { candidates: [] });
      } catch (e) {
        sendResponse({ candidates: [], error: String((e && e.message) || e) });
      }
    })();
    return true;
  }

  if (msg.type === 'COPEX_PAGE_FETCH') {
    (async () => {
      try {
        if (!sender.tab || !sender.tab.id) {
          sendResponse({ ok: false, status: 0, error: 'no-tab' });
          return;
        }
        const results = await chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          world: 'MAIN',
          func: PAGE_FETCH_FUNC,
          args: [msg.url, msg.headers || {}]
        });
        const result = results && results[0] && results[0].result;
        sendResponse(result || { ok: false, status: 0, error: 'no-result' });
      } catch (e) {
        sendResponse({ ok: false, status: 0, error: String((e && e.message) || e) });
      }
    })();
    return true;
  }

  if (msg.type === 'COPEX_WINDOW') {
    (async () => {
      try {
        if (!sender.tab || !sender.tab.windowId) {
          sendResponse({ ok: false });
          return;
        }
        const winId = sender.tab.windowId;
        if (msg.action === 'save') {
          const win = await chrome.windows.get(winId);
          if (win.state !== 'maximized' && win.state !== 'fullscreen') {
            await chrome.windows.update(winId, { state: 'maximized' });
            sendResponse({ ok: true, previous: win.state });
          } else {
            sendResponse({ ok: true, previous: null });
          }
        } else if (msg.action === 'restore' && msg.previous) {
          await chrome.windows.update(winId, { state: msg.previous });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: true });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      }
    })();
    return true;
  }

  if (msg.type === 'COPEX_FETCH') {
    (async () => {
      try {
        const res = await fetch(msg.url, {
          method: 'GET',
          headers: msg.headers || {},
          credentials: 'include'
        });
        const text = await res.text();
        sendResponse({ ok: res.ok, status: res.status, text });
      } catch (e) {
        sendResponse({ ok: false, status: 0, error: String((e && e.message) || e) });
      }
    })();
    return true;
  }
});
