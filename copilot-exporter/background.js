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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

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
