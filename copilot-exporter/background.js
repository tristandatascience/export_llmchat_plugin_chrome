/**
 * AI Chat Export — service worker
 * Relais réseau : les scripts de contenu ne peuvent pas contourner le CORS
 * depuis Chrome 85 ; le service worker, avec les host_permissions, le peut.
 * Il exécute les requêtes préparées par le script de contenu (vers
 * l'API Substrate de Microsoft, avec le jeton déjà présent dans la session
 * de l'onglet). Aucune donnée ne transite ailleurs que vers Microsoft.
 */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object' || msg.type !== 'COPEX_FETCH') return;
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
  return true; // réponse asynchrone
});
