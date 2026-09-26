/**
 * AI Chat Export — popup
 * Interface bilingue (français / anglais) : la langue suit celle du
 * navigateur (« auto ») ou le choix explicite de l'utilisateur.
 * Envoie la demande d'export au content script de l'onglet actif.
 */

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const detectedEl = $('detected');
const platformSel = $('platform');
const langSel = $('lang');
const buttons = [$('btn-md'), $('btn-pdf'), $('btn-txt'), $('btn-copy')];

// ------------------------------------------------------------------
// Soutien / donation — mettez votre URL ici pour afficher le lien
// « ☕ Offrir un café » dans le popup. Laissez vide pour le masquer.
// Exemples :
//   const DONATION_URL = 'https://ko-fi.com/votre_id';
//   const DONATION_URL = 'https://www.paypal.me/votre_id';
//   const DONATION_URL = 'https://github.com/sponsors/tristandatascience';
// ------------------------------------------------------------------
const DONATION_URL = 'https://ko-fi.com/tristanlozahic';

const HOST_TO_PLATFORM = {
  'copilot.com': 'copilot',
  'www.copilot.com': 'copilot',
  'copilot.microsoft.com': 'copilot',
  'm365.cloud.microsoft': 'copilot',
  'chatgpt.com': 'chatgpt',
  'chat.openai.com': 'chatgpt',
  'claude.ai': 'claude',
  'gemini.google.com': 'gemini'
};

const PLATFORM_LABELS = {
  copilot: 'Copilot',
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini'
};

// ------------------------------------------------------------------
// Internationalisation
// ------------------------------------------------------------------
const I18N = {
  fr: {
    platform: 'Plateforme',
    language: 'Langue',
    autoDetect: 'Détection automatique',
    subtitle: 'Copilot · ChatGPT · Claude · Gemini',
    mdBtn: 'Markdown (.md)',
    pdfBtn: 'PDF (.pdf)',
    txtBtn: 'Texte (.txt)',
    copyBtn: 'Copier le Markdown',
    scrollOpt: 'Défiler pour tout charger (historique long)',
    slowOpt: 'Défilement lent pour bien charger les images (longues conversations)',
    domOpt: "Forcer l'extraction par la page (balayage), même si l'API est disponible",
    imagesOpt: 'Inclure les images de la conversation (fichiers séparés)',
    headerOpt: "Inclure l'en-tête (date, URL, titre)",
    footer: '100 % local — aucune donnée ne quitte votre navigateur.',
    donate: 'Offrir un café',
    imagesDone: (n) => `🖼️ ${n} image(s) incluse(s) dans l'export`,
    imagesMissed: (seen, got) => `⚠️ ${seen} image(s) détectée(s), ${got} capturée(s) — certaines sont protégées par le site (CORS)`,
    apiDebugNote: (r) => `🔌 API interne indisponible (${r}) — repli sur la lecture de la page`,
    reading: 'Lecture de la conversation en cours…',
    noTab: 'Aucun onglet actif.',
    invalidResponse: 'Réponse invalide du content script.',
    errTab: "L'onglet actif n'est pas une conversation prise en charge. Ouvrez Copilot, ChatGPT, Claude ou Gemini puis réessayez.",
    errRefresh: "Impossible d'agir sur cet onglet. Actualisez la page (F5), puis réessayez.",
    detected: (p) => `Onglet actif détecté : ${p}`,
    viaApiShort: ' via l\'API',
    copied: (label, count, via) => `📋 ${label} : Markdown copié dans le presse-papiers (${count}${via}).`,
    viaApi: "via l'API — historique complet, pensées et sources incluses",
    viaDom: 'via le DOM de la page',
    ok: (label, count, via, filename) => `✅ ${label} — ${count} messages exportés (${via}).\n📁 ${filename}`,
    raw: (label, filename) => `⚠️ ${label} : structure non reconnue → export brut du texte de la conversation.\n📁 ${filename}`,
    rawLabel: 'export brut'
  },
  en: {
    platform: 'Platform',
    language: 'Language',
    autoDetect: 'Automatic detection',
    subtitle: 'Copilot · ChatGPT · Claude · Gemini',
    mdBtn: 'Markdown (.md)',
    pdfBtn: 'PDF (.pdf)',
    txtBtn: 'Text (.txt)',
    copyBtn: 'Copy Markdown',
    scrollOpt: 'Scroll to load the full history (long conversations)',
    slowOpt: 'Slow scrolling to fully load images (long conversations)',
    domOpt: 'Force page-based extraction (sweep), even when the API is available',
    imagesOpt: 'Include conversation images (separate files)',
    headerOpt: 'Include the header (date, URL, title)',
    footer: '100% local — no data ever leaves your browser.',
    donate: 'Buy me a coffee',
    imagesDone: (n) => `🖼️ ${n} image(s) included in the export`,
    imagesMissed: (seen, got) => `⚠️ ${seen} image(s) detected, ${got} captured — some are protected by the site (CORS)`,
    apiDebugNote: (r) => `🔌 Internal API unavailable (${r}) — falling back to page reading`,
    reading: 'Reading the conversation…',
    noTab: 'No active tab.',
    invalidResponse: 'Invalid response from the content script.',
    errTab: 'The active tab is not a supported conversation. Open Copilot, ChatGPT, Claude or Gemini and try again.',
    errRefresh: 'Cannot act on this tab. Refresh the page (F5) and try again.',
    detected: (p) => `Active tab detected: ${p}`,
    viaApiShort: ' via API',
    copied: (label, count, via) => `📋 ${label}: Markdown copied to clipboard (${count}${via}).`,
    viaApi: 'via the API — full history, thoughts and sources included',
    viaDom: 'from the page DOM',
    ok: (label, count, via, filename) => `✅ ${label} — ${count} messages exported (${via}).\n📁 ${filename}`,
    raw: (label, filename) => `⚠️ ${label}: structure not recognized → raw text export of the conversation.\n📁 ${filename}`,
    rawLabel: 'raw export'
  }
};

// Langue effective : choix explicite, sinon langue du navigateur
// (anglais par défaut pour tout navigateur non francophone).
function resolveUiLang() {
  const choice = langSel.value;
  if (choice === 'fr' || choice === 'en') return choice;
  return (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

let T = I18N.fr;

function applyTranslations() {
  T = I18N[resolveUiLang()];
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const value = T[el.dataset.i18n];
    if (typeof value === 'string') el.textContent = value;
  }
  document.documentElement.lang = resolveUiLang();
  // Lien de soutien : visible uniquement si une URL est configurée
  const donate = $('donate');
  if (DONATION_URL) {
    donate.href = DONATION_URL;
    donate.hidden = false;
  }
}

// ------------------------------------------------------------------
// Options persistantes
// ------------------------------------------------------------------
async function loadOptions() {
  try {
    const stored = await chrome.storage.sync.get({
      scroll: true, images: true, header: true, slowImages: false, forceDom: false,
      platform: 'auto', lang: 'auto'
    });
    $('opt-scroll').checked = stored.scroll;
    $('opt-images').checked = stored.images;
    $('opt-header').checked = stored.header;
    $('opt-slow').checked = stored.slowImages;
    $('opt-dom').checked = stored.forceDom;
    platformSel.value = stored.platform;
    langSel.value = stored.lang;
  } catch (_) { /* valeurs par défaut */ }
}

async function saveOptions() {
  try {
    await chrome.storage.sync.set({
      scroll: $('opt-scroll').checked,
      images: $('opt-images').checked,
      header: $('opt-header').checked,
      slowImages: $('opt-slow').checked,
      forceDom: $('opt-dom').checked,
      platform: platformSel.value,
      lang: langSel.value
    });
  } catch (_) { /* non bloquant */ }
}

function setStatus(kind, message) {
  statusEl.hidden = false;
  statusEl.className = 'status ' + kind;
  statusEl.textContent = message;
}

function setBusy(busy) {
  buttons.forEach((b) => (b.disabled = busy));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function platformFromUrl(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return HOST_TO_PLATFORM[host] || null;
  } catch (_) {
    return null;
  }
}

// Affiche la plateforme détectée sur l'onglet actif (pour information).
async function showDetectedPlatform() {
  try {
    const tab = await getActiveTab();
    let platform = platformFromUrl(tab && tab.url);
    if (!platform && tab && tab.id) {
      try {
        const pong = await chrome.tabs.sendMessage(tab.id, { type: 'COPEX_PING' });
        platform = pong && pong.platform;
      } catch (_) { /* pas de content script ici */ }
    }
    if (platform) {
      detectedEl.hidden = false;
      detectedEl.textContent = T.detected(PLATFORM_LABELS[platform] || platform);
    } else {
      detectedEl.hidden = true;
    }
  } catch (_) { /* non bloquant */ }
}

// S'assure que les scripts sont bien présents dans l'onglet
// (utile si la page était ouverte avant l'installation / la mise à jour).
// Pas de pré-filtre d'URL ici : c'est le content script qui détermine si la
// plateforme est prise en charge (source unique de vérité).
async function ensureContentScript(tab) {
  try {
    const pong = await chrome.tabs.sendMessage(tab.id, { type: 'COPEX_PING' });
    if (pong && pong.ok) return;
  } catch (_) { /* pas encore injecté */ }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['pdf.js', 'content.js']
    });
  } catch (e) {
    throw new Error(T.errRefresh);
  }
}

async function doExport(format) {
  setBusy(true);
  setStatus('ok', T.reading);
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error(T.noTab);

    await ensureContentScript(tab);
    await saveOptions();

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'COPEX_EXPORT',
      format,
      options: {
        platform: platformSel.value === 'auto' ? null : platformSel.value,
        lang: langSel.value === 'auto' ? null : langSel.value,
        scroll: $('opt-scroll').checked,
        images: $('opt-images').checked,
        slowImages: $('opt-slow').checked,
      forceDom: $('opt-dom').checked,
        header: $('opt-header').checked
      }
    });

    if (!response || !response.ok) {
      throw new Error((response && response.error) || T.invalidResponse);
    }

    const label = response.platformLabel || '';
    const imagesNote = response.images > 0 ? '\n' + T.imagesDone(response.images) : '';
    const apiNote = response.apiDebug ? '
' + T.apiDebugNote(response.apiDebug) : '';
    const missedNote = (response.imagesSeen || 0) > (response.images || 0)
      ? '\n' + T.imagesMissed(response.imagesSeen, response.images) : '';
    if (format === 'copy') {
      await navigator.clipboard.writeText(response.text);
      const via = response.source === 'api' ? T.viaApiShort : '';
      setStatus('ok', T.copied(label, response.count || T.rawLabel, via));
    } else if (response.mode === 'structured') {
      const via = response.source === 'api' ? T.viaApi : T.viaDom;
      setStatus('ok', T.ok(label, response.count, via, response.filename) + imagesNote + missedNote + apiNote);
    } else {
      setStatus('warn', T.raw(label, response.filename));
    }
  } catch (e) {
    setStatus('err', '❌ ' + (e.message || String(e)));
  } finally {
    setBusy(false);
  }
}

$('btn-md').addEventListener('click', () => doExport('md'));
$('btn-pdf').addEventListener('click', () => doExport('pdf'));
$('btn-txt').addEventListener('click', () => doExport('txt'));
$('btn-copy').addEventListener('click', () => doExport('copy'));

langSel.addEventListener('change', () => {
  applyTranslations();
  showDetectedPlatform();
});

loadOptions().then(() => {
  applyTranslations();
  showDetectedPlatform();
});
