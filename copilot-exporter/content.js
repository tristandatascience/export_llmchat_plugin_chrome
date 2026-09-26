/**
 * AI Chat Export — content script
 * Extrait la conversation affichée et l'exporte en Markdown ou texte brut.
 *
 * Plateformes prises en charge :
 *   - Copilot  : copilot.com, copilot.microsoft.com, m365.cloud.microsoft
 *                (API interne en priorité, puis DOM)
 *   - ChatGPT  : chatgpt.com, chat.openai.com
 *   - Claude   : claude.ai
 *   - Gemini   : gemini.google.com
 *
 * Chaîne d'extraction : spécifique à la plateforme (messages identifiés
 * un par un, convertis en Markdown) puis, en dernier recours, export brut
 * du texte de la zone de conversation.
 *
 * 100 % local : rien ne quitte le navigateur.
 */

(() => {
  if (window.__copilotExportLoaded) return;
  window.__copilotExportLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ==================================================================
  // Plateformes
  // ==================================================================
  const PLATFORMS = {
    copilot: {
      label: 'Copilot',
      assistantName: 'Copilot',
      filePrefix: 'copilot',
      hosts: ['copilot.com', 'www.copilot.com', 'copilot.microsoft.com', 'm365.cloud.microsoft'],
      apiFirst: true,
      extractors: ['copilotModern', 'copilotCib']
    },
    chatgpt: {
      label: 'ChatGPT',
      assistantName: 'ChatGPT',
      filePrefix: 'chatgpt',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      extractors: ['chatgpt']
    },
    claude: {
      label: 'Claude',
      assistantName: 'Claude',
      filePrefix: 'claude',
      hosts: ['claude.ai'],
      extractors: ['claude']
    },
    gemini: {
      label: 'Gemini',
      assistantName: 'Gemini',
      filePrefix: 'gemini',
      hosts: ['gemini.google.com'],
      extractors: ['gemini']
    }
  };

  function detectPlatform(hostname) {
    for (const [key, platform] of Object.entries(PLATFORMS)) {
      if (platform.hosts.includes(hostname)) return key;
    }
    return null;
  }

  // ==================================================================
  // Internationalisation (français / anglais)
  // ==================================================================
  const STRINGS = {
    fr: {
      you: 'Vous',
      exportedFrom: (date, platform) => `Exportée le ${date} depuis ${platform}`,
      exportedOn: (date) => `Exportée le ${date}`,
      thoughts: (name) => `Réflexions de ${name}`,
      sources: '**Sources :**',
      prompt: (p) => `*Prompt : ${p}*`,
      conversationTitle: (platform) => `Conversation ${platform}`,
      rawTitle: (platform) => `Conversation ${platform} (export brut)`,
      rawTitleTxt: (platform) => `CONVERSATION ${platform.toUpperCase()} (EXPORT BRUT)`,
      rawNote: "L'extraction structurée n'a pas trouvé les messages : voici le texte de la conversation tel qu'affiché.",
      rawBlock: (platform) => `Export brut de la conversation ${platform}`,
      imagesSection: 'Images de la conversation',
      imagesMissed: (seen, got) => `${seen} image(s) détectée(s), ${got} capturée(s) — certaines sont protégées par le site (CORS)`,
      unsupported: "Cet onglet n'est pas une conversation prise en charge (Copilot, ChatGPT, Claude ou Gemini).",
      pdfFailed: "La génération du PDF a échoué. Utilisez l'export Markdown en attendant."
    },
    en: {
      you: 'You',
      exportedFrom: (date, platform) => `Exported on ${date} from ${platform}`,
      exportedOn: (date) => `Exported on ${date}`,
      thoughts: (name) => `${name}'s thoughts`,
      sources: '**Sources:**',
      prompt: (p) => `*Prompt: ${p}*`,
      conversationTitle: (platform) => `Conversation with ${platform}`,
      rawTitle: (platform) => `Conversation with ${platform} (raw export)`,
      rawTitleTxt: (platform) => `CONVERSATION WITH ${platform.toUpperCase()} (RAW EXPORT)`,
      rawNote: 'Structured extraction could not find the messages: here is the text of the conversation as displayed.',
      rawBlock: (platform) => `Raw export of the ${platform} conversation`,
      imagesSection: 'Conversation images',
      imagesMissed: (seen, got) => `${seen} image(s) detected, ${got} captured — some are protected by the site (CORS)`,
      unsupported: 'This tab is not a supported conversation (Copilot, ChatGPT, Claude or Gemini).',
      pdfFailed: 'PDF generation failed. Use the Markdown export in the meantime.'
    }
  };

  // Langue effective : choix explicite, sinon langue du navigateur
  // (anglais par défaut pour tout navigateur non francophone).
  function resolveLang(pref) {
    if (pref === 'fr' || pref === 'en') return pref;
    return (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }

  // ==================================================================
  // Configuration des sélecteurs — adaptable si une interface change.
  // ==================================================================
  const SELECTORS = {
    // --- Copilot : nouveau DOM React ---
    copilotModern: {
      messageSelector: '.group\\/user-message, .group\\/ai-message',
      userClass: 'group/user-message',
      userContent: '[data-content="user-message"]',
      assistantContent: '.group\\/ai-message-item',
      noiseNodes: '[data-testid="message-item-reactions"], button, [aria-hidden="true"]'
    },
    // --- Copilot : API interne ---
    copilotApi: {
      urlPattern: /\/(?:chat\/conversation|chats)\/([A-Za-z0-9_-]+)/i,
      version: '2',
      timeoutMs: 12000
    },
    // --- Copilot : ancienne interface (composants cib-*) ---
    copilotCib: {
      turnSelectors: ['cib-chat-turn'],
      userSelectors: ['cib-user-message', 'cib-shared-user-message'],
      userContentSelectors: ['.content', '.user-message'],
      assistantSelectors: ['cib-assistant-message'],
      assistantContentSelectors: ['.ac-container', '.content', 'cib-message']
    },
    // --- ChatGPT ---
    chatgpt: {
      turnSelector: "section[data-testid^='conversation-turn-']",
      userContent: '[data-message-author-role="user"]',
      assistantContent: '[data-message-author-role="assistant"] .markdown, .markdown'
    },
    // --- Claude ---
    claude: {
      // L'ordre du DOM est l'ordre chronologique de la conversation.
      messageSelector: ".font-claude-response:not(#markdown-artifact), [data-testid='user-message']",
      userSelector: "[data-testid='user-message']",
      userContent: '.font-user-message',
      // Blocs de « réflexions » et artefacts à écarter de la réponse
      assistantNoise: '.artifact-block-cell, [data-testid="thinking"]'
    },
    // --- Gemini ---
    gemini: {
      messageSelector: 'user-query, model-response',
      userTag: 'user-query',
      // Essayés dans l'ordre : .query-text est plus précis que le conteneur.
      userContent: '.query-text',
      userContentFallback: 'div.query-content',
      assistantContent: 'message-content',
      assistantMarkdown: '.markdown'
    }
  };

  // Petites lignes d'interface à retirer en fin de message (mode texte brut).
  const NOISE_WORDS = [
    'copier', 'copy', 'copier le code', 'copy code', 'régénérer', 'regenerate',
    'répondre', 'reply', 'modifier', 'edit', 'réessayer', 'retry',
    'bonne réponse', 'good response', 'mauvaise réponse', 'bad response',
    'partager', 'share', 'plus', 'more', 'voir plus', 'see more',
    'exécuter', 'run', 'exécuter le code', 'you said', 'chatgpt said',
    'message copilot', 'message chatgpt', 'message claude', 'message gemini',
    'appuyez sur tabulation pour accéder aux boutons épingler et autres options',
    'il est possible que le contenu généré par l\'ia soit incorrect',
    'afficher l\'historique des conversations', 'nouvelle conversation',
    'new conversation'
  ];

  // ==================================================================
  // Traversée du DOM y compris les shadow roots
  // ==================================================================
  function* iterTree(root) {
    const children = root.children || [];
    for (const child of children) {
      yield child;
      yield* iterTree(child);
      if (child.shadowRoot) yield* iterTree(child.shadowRoot);
    }
  }

  function deepQueryAll(selector, root) {
    const base = root || document.body;
    const out = [];
    try {
      for (const el of iterTree(base)) {
        if (typeof el.matches === 'function' && el.matches(selector)) out.push(el);
      }
    } catch (_) { /* arbre détaché */ }
    return out;
  }

  function deepQueryFirst(selectors, root) {
    for (const sel of selectors) {
      const found = deepQueryAll(sel, root)[0];
      if (found) return found;
    }
    return null;
  }

  // innerText d'un élément en incluant le contenu des shadow DOM imbriqués.
  function deepInnerText(node) {
    if (!node) return '';
    if (node instanceof ShadowRoot) {
      return Array.from(node.children).map(deepInnerText).filter(Boolean).join('\n');
    }
    let text = '';
    try { text = node.innerText || node.textContent || ''; } catch (_) { text = ''; }
    for (const el of node.querySelectorAll('*')) {
      if (el.shadowRoot) text += '\n' + deepInnerText(el.shadowRoot);
    }
    return text;
  }

  // ==================================================================
  // Conversion DOM -> Markdown (best effort)
  // ==================================================================
  function inlineMd(node) {
    let s = '';
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) {
        s += n.nodeValue.replace(/\s+/g, ' ');
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = n.tagName.toLowerCase();
        if (tag === 'br') { s += '\n'; }
        else if (tag === 'strong' || tag === 'b') {
          const t = inlineMd(n).trim();
          if (t) s += '**' + t + '**';
        }
        else if (tag === 'em' || tag === 'i') {
          const t = inlineMd(n).trim();
          if (t) s += '*' + t + '*';
        }
        else if (tag === 'code') {
          s += '`' + (n.textContent || '').trim() + '`';
        }
        else if (tag === 'a') {
          const t = inlineMd(n).trim() || (n.getAttribute('href') || '');
          const href = n.getAttribute('href') || '';
          s += t ? '[' + t + '](' + href + ')' : '';
        }
        else if (tag === 'img') {
          const src = n.getAttribute('src') || '';
          const alt = n.getAttribute('alt') || 'image';
          // Les icônes SVG (avatars, pictos d'interface) ne sont pas des
          // images de conversation : on les ignore.
          const isSvg = /\.svg($|\?)/i.test(src) || /^data:image\/svg/i.test(src);
          if (src && !isSvg) s += '![' + alt + '](' + src + ')';
        }
        else if (tag === 'svg' || tag === 'style' || tag === 'script' || tag === 'button') {
          // icônes et contrôles : ignorés
        }
        else if (n.shadowRoot && n.children.length === 0) {
          s += deepInnerText(n.shadowRoot);
        }
        else {
          s += inlineMd(n);
        }
      }
    }
    return s;
  }

  function guessLang(pre) {
    const code = pre.querySelector('code');
    const cls = code ? (code.getAttribute('class') || '') : (pre.getAttribute('class') || '');
    const m = cls.match(/(?:language|lang)-([a-z0-9+#-]+)/i);
    if (m) return m[1].toLowerCase();
    // Gemini : libellé de langue dans l'en-tête du bloc de code
    if (typeof pre.closest === 'function') {
      const block = pre.closest('.code-block');
      const deco = block ? block.querySelector('.code-block-decoration span') : null;
      if (deco) {
        const label = (deco.textContent || '').trim().toLowerCase();
        if (label && !/copy|copier/.test(label)) return label;
      }
    }
    return '';
  }

  function listMd(list, ordered, depth) {
    const pad = '  '.repeat(depth);
    const lines = [];
    let index = 1;
    for (const li of Array.from(list.children)) {
      if (!li.tagName || li.tagName.toLowerCase() !== 'li') continue;
      const subLists = Array.from(li.children).filter((c) =>
        /^u[lo]l$/.test(c.tagName.toLowerCase())
      );
      const clone = li.cloneNode(true);
      for (const sl of Array.from(clone.children)) {
        if (/^u[lo]l$/.test(sl.tagName.toLowerCase())) sl.remove();
      }
      const text = inlineMd(clone).replace(/\s+/g, ' ').trim();
      lines.push(pad + (ordered ? index + '. ' : '- ') + text);
      for (const sl of subLists) lines.push(listMd(sl, sl.tagName.toLowerCase() === 'ol', depth + 1));
      index++;
    }
    return lines.join('\n');
  }

  function tableMd(table) {
    const rows = [];
    for (const tr of Array.from(table.querySelectorAll('tr'))) {
      const cells = Array.from(tr.querySelectorAll('th,td')).map((c) =>
        inlineMd(c).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|')
      );
      rows.push('| ' + cells.join(' | ') + ' |');
    }
    if (rows.length > 0 && table.querySelector('th')) {
      const cols = table.querySelector('tr').querySelectorAll('th,td').length;
      rows.splice(1, 0, '| ' + Array(cols).fill('---').join(' | ') + ' |');
    }
    return rows.join('\n');
  }

  function blockMd(node, depth) {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.nodeValue || '').trim();
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();

    if (node.shadowRoot && node.children.length === 0) {
      return deepInnerText(node.shadowRoot).trim();
    }

    switch (tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const level = parseInt(tag[1], 10);
        return '#'.repeat(level) + ' ' + inlineMd(node).trim();
      }
      case 'p': {
        const t = inlineMd(node).trim();
        return t;
      }
      case 'pre': {
        const code = (node.textContent || '').replace(/\n+$/, '');
        const lang = guessLang(node);
        return '```' + lang + '\n' + code + '\n```';
      }
      case 'ul': return listMd(node, false, depth || 0);
      case 'ol': return listMd(node, true, depth || 0);
      case 'blockquote': {
        const inner = childrenMd(node).trim();
        return inner.split('\n').map((l) => '> ' + l).join('\n');
      }
      case 'table': return tableMd(node);
      case 'hr': return '---';
      case 'br': return '';
      case 'img': {
        // Image posée directement (hors paragraphe) : référence Markdown
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || 'image';
        const isSvg = /\.svg($|\?)/i.test(src) || /^data:image\/svg/i.test(src);
        return src && !isSvg ? `![${alt}](${src})` : '';
      }
      case 'svg': case 'style': case 'script': case 'button':
      case 'cib-attachment-chips': case 'cib-shared-conversation-footer-bar':
        return '';
      default:
        return childrenMd(node, depth);
    }
  }

  function childrenMd(el, depth) {
    const parts = [];
    for (const n of Array.from(el.childNodes)) {
      const md = blockMd(n, depth);
      if (md && md.trim()) parts.push(md.trim());
    }
    return parts.join('\n\n');
  }

  function domToMarkdown(el) {
    if (!el) return '';
    let md = '';
    try { md = childrenMd(el, 0); } catch (_) { md = ''; }
    if (!md || !md.trim()) md = deepInnerText(el).trim();
    return md
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Une ligne est-elle du bruit d'interface ? (comparaison normalisée :
  // apostrophes typographiques ramenées à l'apostrophe ASCII)
  function noiseLine(line) {
    const norm = String(line).trim().toLowerCase()
      .replace(/\u2019/g, "'")
      .replace(/[.:…]+$/, '');
    return norm === '' || NOISE_WORDS.includes(norm);
  }

  // Retire les petites lignes d'interface (boutons Copier, etc.) en fin de texte.
  function stripNoise(text) {
    const lines = text.split('\n');
    while (lines.length > 0 && noiseLine(lines[lines.length - 1])) lines.pop();
    return lines.join('\n').trim();
  }

  // Copie nettoyée d'un contenu : boutons, icônes et blocs de bruit retirés.
  function cleanClone(el, noiseSelector) {
    const clone = el.cloneNode(true);
    const selectors = ['button', 'svg', '[aria-hidden="true"]'];
    if (noiseSelector) selectors.push(noiseSelector);
    for (const sel of selectors) {
      for (const n of clone.querySelectorAll(sel)) n.remove();
    }
    return clone;
  }

  // ==================================================================
  // Extracteurs Copilot
  // ==================================================================

  // API interne : historique complet en JSON (réflexions, images, sources).
  async function extractCopilotApi(T) {
    const cfg = SELECTORS.copilotApi;
    const match = location.pathname.match(cfg.urlPattern);
    if (!match) return null;
    const chatId = match[1];
    const base = `${location.origin}/c/api`;
    const historyUrl =
      `${base}/conversations/${encodeURIComponent(chatId)}/history?api-version=${cfg.version}`;

    const fetchWithTimeout = (url, options) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
      return fetch(url, { credentials: 'include', ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
    };

    let res;
    try {
      res = await fetchWithTimeout(historyUrl, { headers: { accept: 'application/json' } });
      if (!res.ok) {
        // Réchauffe la session puis réessaie une fois.
        try {
          await fetchWithTimeout(`${base}/start`, { method: 'POST' });
        } catch (_) { /* la relance suffit peut-être */ }
        res = await fetchWithTimeout(historyUrl, { headers: { accept: 'application/json' } });
      }
    } catch (_) {
      return null;
    }
    if (!res.ok) return null;

    let data;
    try { data = await res.json(); } catch (_) { return null; }
    const results = Array.isArray(data && data.results) ? data.results : [];
    if (results.length === 0) return null;

    results.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const messages = [];
    for (const msg of results) {
      const authorType = msg && msg.author && msg.author.type;
      const role = authorType === 'human' ? 'user' : authorType === 'ai' ? 'assistant' : null;
      if (!role) continue;
      const parts = Array.isArray(msg && msg.parts) ? msg.parts : [];

      let body = '';
      let thoughts = '';
      const citations = [];
      for (const part of parts) {
        if (!part) continue;
        if (part.type === 'text' && part.text) {
          body += (body ? '\n\n' : '') + part.text;
        } else if (part.type === 'image' && part.url) {
          body += `\n\n![image](${part.url})`;
          if (part.prompt) body += '\n\n' + T.prompt(part.prompt);
        } else if (part.type === 'citation' && part.url) {
          citations.push(part.title ? `[${part.title}](${part.url})` : part.url);
        } else if (part.type === 'chainOfThought' && part.text) {
          thoughts += (thoughts ? '\n\n' : '') + part.text;
        }
      }

      let text = '';
      if (role === 'assistant' && thoughts) {
        text += '> 💭 **' + T.thoughts('Copilot') + '**\n> '
          + thoughts.split('\n').join('\n> ') + '\n\n';
      }
      text += body.trim();
      if (citations.length) text += '\n\n' + T.sources + ' ' + citations.join(' · ');
      if (text.trim()) messages.push({ role, text: text.trim() });
    }
    return messages.length > 0 ? messages : null;
  }

  // Nouveau DOM React de copilot.com.
  function extractCopilotModern() {
    const cfg = SELECTORS.copilotModern;
    const nodes = document.querySelectorAll(cfg.messageSelector);
    const messages = [];
    for (const node of nodes) {
      if (node.classList.contains(cfg.userClass)) {
        const content = node.querySelector(cfg.userContent) || node;
        let text = stripNoise(deepInnerText(content).trim());
        // Images envoyées par l'utilisateur (pièces jointes)
        const userImgs = collectImgRefs(node, cfg.userContent);
        if (userImgs) text += (text ? '\n\n' : '') + userImgs;
        if (text) messages.push({ role: 'user', text });
      } else {
        const content = node.querySelector(cfg.assistantContent) || node;
        const clone = cleanClone(content, cfg.noiseNodes);
        let text = '';
        try { text = domToMarkdown(clone); } catch (_) { text = ''; }
        if (!text) text = stripNoise(deepInnerText(content).trim());
        if (text) messages.push({ role: 'assistant', text: stripNoise(text) });
      }
    }
    return messages;
  }

  // Ancienne interface Bing/Copilot (composants cib-*, shadow DOM inclus).
  function extractCopilotCib() {
    const cfg = SELECTORS.copilotCib;
    const messages = [];
    const turns = deepQueryAll(cfg.turnSelectors.join(', '));
    for (const turn of turns) {
      const userMsg = deepQueryFirst(cfg.userSelectors, turn);
      if (userMsg) {
        const content = deepQueryFirst(cfg.userContentSelectors, userMsg) || userMsg;
        const text = stripNoise(deepInnerText(content).trim());
        if (text) messages.push({ role: 'user', text });
      }
      const asst = deepQueryFirst(cfg.assistantSelectors, turn);
      if (asst) {
        const container = deepQueryFirst(cfg.assistantContentSelectors, asst);
        let text = container ? domToMarkdown(container) : '';
        if (!text || !text.trim()) {
          text = stripNoise(deepInnerText(asst).trim());
          const lines = text.split('\n');
          if (lines.length > 1 && /^copilot$/i.test(lines[0].trim())) lines.shift();
          text = stripNoise(lines.join('\n'));
        }
        if (text) messages.push({ role: 'assistant', text: stripNoise(text) });
      }
    }
    return messages;
  }

  // Références Markdown des images d'une zone du DOM : écarte les icônes /
  // avatars (SVG, petites tailles) et, optionnellement, les images déjà
  // traitées par un conteneur donné (ex. .markdown déjà converti).
  function collectImgRefs(scope, skipWithin) {
    if (!scope || !scope.querySelectorAll) return '';
    const seen = new Set();
    const refs = [];
    for (const img of scope.querySelectorAll('img')) {
      if (skipWithin && img.closest && img.closest(skipWithin)) continue;
      const src = img.getAttribute('src') || '';
      if (!src || seen.has(src)) continue;
      if (/\.svg($|\?)/i.test(src) || /^data:image\/svg/i.test(src)) continue;
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if (w && h && (w < 100 || h < 100)) continue;
      seen.add(src);
      refs.push(`![image](${src})`);
    }
    return refs.join('\n\n');
  }

  // ==================================================================
  // Extracteur ChatGPT
  // ==================================================================
  function extractChatGPT() {
    const cfg = SELECTORS.chatgpt;
    const turns = document.querySelectorAll(cfg.turnSelector);
    const messages = [];
    for (const turn of turns) {
      const isUser =
        turn.getAttribute('data-turn') === 'user' ||
        !!turn.querySelector(cfg.userContent);
      if (isUser) {
        const content = turn.querySelector(cfg.userContent) || turn;
        let text = stripNoise(deepInnerText(content).trim());
        // Images envoyées par l'utilisateur (hors zone de texte)
        const userImgs = collectImgRefs(turn, cfg.userContent);
        if (userImgs) text += (text ? '\n\n' : '') + userImgs;
        if (text) messages.push({ role: 'user', text });
      } else {
        let text = '';
        for (const md of turn.querySelectorAll(cfg.assistantContent)) {
          const part = domToMarkdown(cleanClone(md));
          if (part) text += (text ? '\n\n' : '') + part;
        }
        // Images générées affichées hors de la zone markdown (DALL-E…)
        const extraImgs = collectImgRefs(turn, '.markdown');
        if (extraImgs) text += (text ? '\n\n' : '') + extraImgs;
        if (!text) {
          const content = turn.querySelector('.whitespace-pre-wrap') || turn;
          text = deepInnerText(content).trim();
        }
        if (text) messages.push({ role: 'assistant', text: stripNoise(text) });
      }
    }
    return messages;
  }

  // ==================================================================
  // Extracteur Claude
  // ==================================================================
  function extractClaude() {
    const cfg = SELECTORS.claude;
    const nodes = document.querySelectorAll(cfg.messageSelector);
    const messages = [];
    for (const node of nodes) {
      if (node.matches(cfg.userSelector)) {
        const content = node.querySelector(cfg.userContent) || node;
        let text = stripNoise(deepInnerText(content).trim());
        // Images envoyées par l'utilisateur (pièces jointes)
        const userImgs = collectImgRefs(node, cfg.userContent);
        if (userImgs) text += (text ? '\n\n' : '') + userImgs;
        if (text) messages.push({ role: 'user', text });
      } else {
        // Réponse : retire réflexions (« thinking »), artefacts et contrôles.
        const clone = node.cloneNode(true);
        for (const n of clone.querySelectorAll(cfg.assistantNoise)) n.remove();
        // Les blocs de réflexion de Claude sont des enfants directs à
        // l'animation repliable (classe transition-all) : on les écarte.
        for (const child of Array.from(clone.children)) {
          if (child.classList && child.classList.contains('transition-all')) child.remove();
        }
        let text = '';
        try { text = domToMarkdown(clone); } catch (_) { text = ''; }
        if (!text) text = stripNoise(deepInnerText(node).trim());
        if (text) messages.push({ role: 'assistant', text: stripNoise(text) });
      }
    }
    return messages;
  }

  // ==================================================================
  // Extracteur Gemini
  // ==================================================================
  function extractGemini() {
    const cfg = SELECTORS.gemini;
    const nodes = document.querySelectorAll(cfg.messageSelector);
    const messages = [];
    for (const node of nodes) {
      if (node.tagName.toLowerCase() === cfg.userTag) {
        const content =
          node.querySelector(cfg.userContent) ||
          node.querySelector(cfg.userContentFallback) ||
          node;
        let text = stripNoise(deepInnerText(content).trim().replace(/^you said\s+/i, ''));
        // Images envoyées par l'utilisateur (pièces jointes, hors texte)
        const userImgs = collectImgRefs(node, cfg.userContent);
        if (userImgs) text += (text ? '\n\n' : '') + userImgs;
        if (text) messages.push({ role: 'user', text });
      } else {
        // Zones de texte de la réponse, où qu'elles soient dans le nœud
        // (la nouvelle interface « islands » de Gemini peut les déplacer).
        let text = '';
        for (const md of node.querySelectorAll('.markdown')) {
          const part = domToMarkdown(cleanClone(md));
          if (part) text += (text ? '\n\n' : '') + part;
        }
        if (!text) {
          const mc = node.querySelector(cfg.assistantContent);
          if (mc) text = deepInnerText(mc).trim();
        }
        // Images de TOUTE la réponse : Gemini place les images générées dans
        // des cartes d'aperçu sœurs de message-content (URLs blob:).
        const extraImgs = collectImgRefs(node, cfg.assistantMarkdown);
        if (extraImgs) text += (text ? '\n\n' : '') + extraImgs;
        if (!text) text = stripNoise(deepInnerText(node).trim());
        if (text) messages.push({ role: 'assistant', text: stripNoise(text) });
      }
    }
    return messages;
  }

  // ------------------------------------------------------------------
  // Stratégie de repli universelle : découpage du texte de la page sur les
  // marqueurs d'accessibilité « You said: / Copilot said: » (EN et FR).
  // Sauve les export quand l'interface a changé mais que le texte est là.
  // ------------------------------------------------------------------
  const SAID_MARKERS = [
    { role: 'user', re: /^(?:you said|vous avez dit|vous avez envoyé)\s*:?\s*$/i },
    { role: 'assistant', re: /^(?:copilot said|copilot a dit|chatgpt said|chatgpt a dit|claude said|claude a dit|gemini said|gemini a dit)\s*:?\s*$/i }
  ];

  function extractFromMarkers() {
    const text = deepInnerText(conversationRoot()).trim();
    if (!text) return [];
    const messages = [];
    let current = null;
    const flush = () => {
      if (current) {
        const t = stripNoise(current.lines.join('\n'));
        if (t) messages.push({ role: current.role, text: t });
      }
      current = null;
    };
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      let matched = false;
      for (const marker of SAID_MARKERS) {
        if (marker.re.test(line)) {
          flush();
          current = { role: marker.role, lines: [] };
          matched = true;
          break;
        }
      }
      if (!matched && current) current.lines.push(rawLine);
    }
    flush();
    return messages;
  }

  const EXTRACTOR_FUNCTIONS = {
    copilotModern: extractCopilotModern,
    copilotCib: extractCopilotCib,
    chatgpt: extractChatGPT,
    claude: extractClaude,
    gemini: extractGemini
  };

  // ==================================================================
  // Repérage de la zone de conversation (mode brut) + chargement complet
  // ==================================================================
  function findScroller() {
    let best = null;
    let bestArea = 0;
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const st = getComputedStyle(el);
      const oy = st.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 40) {
        const area = el.clientHeight * el.clientWidth;
        if (area > bestArea) { bestArea = area; best = el; }
      }
    }
    if (!best && document.scrollingElement && document.scrollingElement.scrollHeight > window.innerHeight + 40) {
      best = document.scrollingElement;
    }
    return best;
  }

  function conversationRoot() {
    return (
      document.querySelector('[data-test-id="chat-history-container"]') ||
      document.querySelector('#chat-history') ||
      document.querySelector('#conversation') ||
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      findScroller() ||
      document.body
    );
  }

  // Défilement pour forcer le chargement de l'historique complet.
  async function ensureFullyLoaded() {
    const scroller = findScroller();
    const target = scroller && scroller !== document.scrollingElement ? scroller : null;
    const getTop = () => (target ? target.scrollTop : window.scrollY);
    const setTop = (v) => { if (target) target.scrollTop = v; else window.scrollTo(0, v); };
    const getHeight = () => (target ? target.scrollHeight : document.body.scrollHeight);

    const before = getTop();
    let last = -1;
    let stable = 0;
    for (let i = 0; i < 40 && stable < 4; i++) {
      setTop(0);
      await sleep(250);
      const h = getHeight();
      if (h === last) stable++; else { stable = 0; last = h; }
    }
    setTop(before);
    await sleep(600); // laisse le rendu paresseux (islands, virtualisation) se stabiliser
  }

  // ==================================================================
  // Mise en forme des exports
  // ==================================================================
  function fileBaseName(platform) {
    const raw = (document.title || `conversation ${platform.label}`)
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(new RegExp(`[-–— ]*${platform.label}.*$`, 'i'), '')
      .trim()
      .slice(0, 40);
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    const safe = raw.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-')
      || 'conversation';
    return `${platform.filePrefix}-${safe}-${stamp}`;
  }

  function buildMarkdown(messages, meta, includeHeader) {
    const parts = [];
    if (includeHeader) {
      parts.push(`# ${meta.title || meta.fallbackTitle}`);
      parts.push(`> ${meta.exportLine}  \n> ${meta.url}`);
      parts.push('---');
      parts.push('');
    }
    for (const m of messages) {
      parts.push(m.role === 'user' ? `## 👤 ${meta.youLabel}` : `## 🤖 ${meta.assistantName}`);
      parts.push('');
      if (m.role === 'user') {
        parts.push(m.text.split('\n').map((l) => '> ' + l).join('\n'));
      } else {
        parts.push(m.text);
      }
      parts.push('');
      parts.push('---');
      parts.push('');
    }
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function buildText(messages, meta, includeHeader) {
    const bar = '='.repeat(64);
    const lines = [];
    if (includeHeader) {
      lines.push(bar);
      lines.push(`CONVERSATION ${meta.platform.toUpperCase()} — ${meta.title || ''}`);
      lines.push(meta.exportLineTxt);
      lines.push(meta.url);
      lines.push(bar);
      lines.push('');
    }
    for (const m of messages) {
      const who = m.role === 'user' ? meta.youLabel.toUpperCase() : meta.assistantName.toUpperCase();
      lines.push('-'.repeat(64));
      lines.push(`[${who}]`);
      lines.push('-'.repeat(64));
      // Références d'images lisibles en texte brut : [Image N — fichier]
      lines.push(String(m.text).replace(IMAGE_RE, (whole, alt, url) =>
        alt && alt !== 'image' ? `[${alt}]` : `[Image : ${url}]`
      ));
      lines.push('');
    }
    return lines.join('\n');
  }

  function buildRaw(format, meta) {
    const root = conversationRoot();
    let text = deepInnerText(root).trim();
    text = text.replace(/\n{3,}/g, '\n\n');
    if (format === 'md') {
      const header = [
        `# ${meta.rawTitle}`,
        `> ${meta.exportLine}  \n> ${meta.url}`,
        `> ${meta.rawNote}`,
        '',
        '---',
        ''
      ].join('\n');
      return header + text + '\n';
    }
    return [
      '='.repeat(64),
      meta.rawTitleTxt,
      meta.exportLineTxt,
      meta.url,
      '='.repeat(64),
      '',
      text
    ].join('\n');
  }

  // ==================================================================
  // Capture des images de la conversation (téléchargées en fichiers)
  // ==================================================================
  const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const MAX_IMAGES = 40;
  const FETCH_CONCURRENCY = 4;

  function extFromUrl(url) {
    if (/^data:/i.test(url)) {
      const m = url.slice(5, 40).match(/^image\/([a-z0-9+.-]+)/i);
      if (m) return mimeToExt(m[1]);
    }
    const m = url.split('?')[0].match(/\.(png|jpe?g|webp|gif|bmp)$/i);
    if (m) return mimeToExt(m[1]);
    return null;
  }

  function mimeToExt(mime) {
    const base = String(mime).toLowerCase().split('+')[0];
    if (base === 'jpeg') return 'jpg';
    if (base === 'svg+xml') return 'svg';
    return base;
  }

  async function fetchImageBlob(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { credentials: 'include', signal: controller.signal });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob || !/^image\//.test(blob.type || '')) return null;
      return blob.size > 0 ? blob : null;
    } catch (_) {
      return null; // CORS, blob expiré, hors ligne… : l'URL d'origine est conservée
    } finally {
      clearTimeout(timer);
    }
  }

  function extFor(blob, url) {
    const ext = mimeToExt((blob.type || '').split('/')[1] || '');
    if (ext && ext !== 'svg') return ext;
    return extFromUrl(url) || 'png';
  }

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    });
    await Promise.all(workers);
    return out;
  }

  // Télécharge les images référencées dans les messages (![alt](url)) et
  // réécrit les références vers les fichiers locaux.
  // Renvoie { messages, images, seen } avec seen = images repérées.
  async function captureImages(messages, baseName) {
    const urls = [];
    for (const m of messages) {
      for (const match of String(m.text).matchAll(IMAGE_RE)) {
        if (!urls.includes(match[2])) urls.push(match[2]);
      }
    }
    if (urls.length === 0) return { messages, images: [], seen: 0 };

    const limited = urls.slice(0, MAX_IMAGES);
    const blobs = new Map();
    const fetched = await mapLimit(limited, FETCH_CONCURRENCY, async (url) => {
      // fetch d'abord, puis capture directe depuis l'élément affiché
      return (await fetchImageBlob(url)) || (await captureViaElement(url));
    });
    limited.forEach((url, i) => { if (fetched[i]) blobs.set(url, fetched[i]); });

    const renames = new Map();
    let n = 0;
    for (const url of limited) {
      const blob = blobs.get(url);
      if (!blob) continue;
      n++;
      const num = String(n).padStart(2, '0');
      const filename = `${baseName}-img${num}.${extFor(blob, url)}`;
      renames.set(url, { n, filename });
    }

    // Chaque image est référencée clairement dans le texte :
    // ![Image N — nom-du-fichier.ext](nom-du-fichier.ext)
    const rewritten = messages.map((m) => ({
      role: m.role,
      text: String(m.text).replace(IMAGE_RE, (whole, alt, url) => {
        const info = renames.get(url);
        if (!info) return whole; // non téléchargeable : URL d'origine conservée
        return `![Image ${info.n} — ${info.filename}](${info.filename})`;
      })
    }));
    const images = Array.from(renames.entries())
      .map(([url, info]) => ({ blob: blobs.get(url), filename: info.filename }));
    return { messages: rewritten, images, seen: limited.length };
  }

  function bitmapToJpeg(bitmap, maxDim) {
    const limit = maxDim || 1600;
    const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // l'alpha devient blanc (le JPEG n'en a pas)
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blobPromise = canvas.convertToBlob
      ? canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
      : new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blobPromise.then((blob) => (blob ? { blob, width: w, height: h } : null));
  }

  // Décode n'importe quel format d'image supporté par le navigateur et le
  // ré-encode en JPEG (prêt pour l'intégration directe dans le PDF).
  async function toJpeg(blob, maxDim) {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const r = await bitmapToJpeg(bitmap, maxDim);
      bitmap.close();
      if (!r) return null;
      return { bytes: new Uint8Array(await r.blob.arrayBuffer()), width: r.width, height: r.height };
    } catch (_) {
      return null;
    }
  }

  // Capture directe depuis l'élément <img> affiché dans la page (canvas
  // local) : fonctionne pour les images de même origine — blob:, data:,
  // même domaine — y compris quand fetch échoue.
  async function captureViaElement(src) {
    const root = conversationRoot() || document;
    for (const img of root.querySelectorAll('img')) {
      if ((img.getAttribute('src') || '') !== src) continue;
      try {
        const bitmap = await createImageBitmap(img);
        const r = await bitmapToJpeg(bitmap);
        bitmap.close();
        if (r) return r.blob;
      } catch (_) {
        return null; // image cross-origin protégée (canvas souillé)
      }
    }
    return null;
  }

  // Éléments marqueurs « You said: / Copilot said: » dans le DOM (feuilles
  // au texte exact) — servent d'ancre pour replacer les images.
  const MARKER_ELEMENT_RE = /^(?:you said|vous avez dit|copilot said|copilot a dit)\s*:?\s*$/i;
  const MARKER_USER_RE = /^(?:you said|vous avez dit)/i;

  function markerElements(root) {
    const out = [];
    for (const el of root.querySelectorAll('*')) {
      if (el.children.length === 0) {
        const t = (el.textContent || '').trim();
        if (t && MARKER_ELEMENT_RE.test(t)) {
          out.push({ el, role: MARKER_USER_RE.test(t) ? 'user' : 'assistant' });
        }
      }
    }
    return out;
  }

  // Ancres de position : conteneurs de messages de la plateforme quand ils
  // existent (Gemini), sinon marqueurs « You said:/Copilot said: ».
  function anchorCandidates(root, platformKey) {
    if (platformKey === 'gemini') {
      return Array.from(root.querySelectorAll('user-query, model-response'))
        .map((el) => ({
          el,
          role: el.tagName.toLowerCase() === 'user-query' ? 'user' : 'assistant'
        }));
    }
    return markerElements(root);
  }

  // Récolte les images affichées dans la conversation mais absentes des
  // textes extraits, et ancre chacune à SON message via sa position dans le
  // DOM. L'ancrage n'est utilisé que si les ancres s'alignent parfaitement
  // avec les messages extraits (même nombre, mêmes rôles) ; sinon les
  // images partent en section finale plutôt que d'être mal placées.
  function harvestImages(messages, sectionLabel, platformKey) {
    if (!messages || messages.length === 0) return messages;
    const known = new Set();
    for (const m of messages) {
      for (const match of String(m.text).matchAll(IMAGE_RE)) known.add(match[2]);
    }
    const root = conversationRoot();
    if (!root) return messages;

    const anchors = anchorCandidates(root, platformKey);
    const aligned = anchors.length === messages.length &&
      anchors.every((a, i) => a.role === messages[i].role);

    const trailing = [];
    const seen = new Set();
    for (const img of root.querySelectorAll('img')) {
      const src = img.getAttribute('src') || '';
      if (!src || seen.has(src) || known.has(src)) continue;
      if (/\.svg($|\?)/i.test(src) || /^data:image\/svg/i.test(src)) continue;
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if (w && h && (w < 100 || h < 100)) continue;
      seen.add(src);

      const ref = `![image](${src})`;
      let placed = false;
      if (aligned) {
        let anchorIdx = -1;
        for (let k = 0; k < anchors.length; k++) {
          if (anchors[k].el.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING) {
            anchorIdx = k;
          } else {
            break; // les ancres sont dans l'ordre du document
          }
        }
        if (anchorIdx >= 0) {
          messages[anchorIdx].text += (messages[anchorIdx].text ? '\n\n' : '') + ref;
          placed = true;
        }
      }
      if (!placed) trailing.push(ref);
    }
    if (trailing.length > 0) {
      const last = messages[messages.length - 1];
      last.text += `\n\n---\n\n${sectionLabel}\n\n${trailing.join('\n\n')}`;
    }
    return messages;
  }

  // ==================================================================
  // Téléchargement (Blob + <a download>) — texte ou binaire
  // ==================================================================
  function downloadFile(data, filename, mime) {
    const isText = typeof data === 'string';
    const blob = new Blob([data], { type: isText ? mime + ';charset=utf-8' : mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.documentElement.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  }

  // Certains rendus dupliquent le texte utilisateur (copie accessible +
  // copie visible) : si le texte est fait de deux blocs identiques, on n'en
  // garde qu'un.
  function collapseDuplicate(text) {
    const t = String(text || '').trim();
    if (!t) return t;
    const parts = t.split(/\n{2,}/);
    if (parts.length === 2 && parts[0].trim() === parts[1].trim()) {
      return parts[0].trim();
    }
    return t;
  }

  // ==================================================================
  // Pipeline d'export
  // ==================================================================
  async function runExport(format, options) {
    const forced = options.platform && PLATFORMS[options.platform]
      ? options.platform
      : null;
    const key = forced || detectPlatform(location.hostname);
    const platform = key ? PLATFORMS[key] : null;
    const T = STRINGS[resolveLang(options.lang)];
    if (!platform) {
      return { ok: false, error: T.unsupported };
    }

    const meta = {
      platform: platform.label,
      assistantName: platform.assistantName,
      title: (document.title || '').trim(),
      date: new Date().toLocaleString(resolveLang(options.lang) === 'en' ? 'en-GB' : 'fr-FR'),
      url: location.href
    };
    // Chaînes localisées portées par meta pour toutes les mises en forme
    meta.youLabel = T.you;
    meta.fallbackTitle = T.conversationTitle(platform.label);
    meta.exportLine = T.exportedFrom(meta.date, platform.label);
    meta.exportLineTxt = T.exportedOn(meta.date);
    meta.rawTitle = T.rawTitle(platform.label);
    meta.rawTitleTxt = T.rawTitleTxt(platform.label);
    meta.rawNote = T.rawNote;
    meta.rawBlock = T.rawBlock(platform.label);

    // Stratégie 1 : API interne (Copilot uniquement) — pas besoin de défiler.
    let messages = null;
    let source = 'api';
    if (platform.apiFirst) {
      try { messages = await extractCopilotApi(T); } catch (_) { messages = null; }
    }

    // Stratégie 2 : extracteurs DOM de la plateforme.
    if (!messages || messages.length === 0) {
      source = 'dom';
      if (options.scroll) {
        try { await ensureFullyLoaded(); } catch (_) { /* non bloquant */ }
      }
      for (const name of platform.extractors) {
        const fn = EXTRACTOR_FUNCTIONS[name];
        if (!fn) continue;
        try {
          messages = fn() || [];
        } catch (_) {
          messages = [];
        }
        if (messages.length > 0) break;
      }
      // Dernier repli structuré : découpage sur les marqueurs « You said: /
      // Copilot said: » présents dans le rendu d'accessibilité de la page.
      if (!messages || messages.length === 0) {
        try { messages = extractFromMarkers(); } catch (_) { messages = []; }
      }
    }

    // Garde-fou qualité : une vraie conversation contient toujours des
    // réponses de l'IA. Si l'extraction n'a trouvé QUE des messages
    // utilisateur, elle est partielle (interface modifiée) : on préfère un
    // export brut complet plutôt qu'un fichier tronqué.
    if (messages && messages.length > 0 && !messages.some((m) => m.role === 'assistant')) {
      messages = [];
    }
    // Nettoyage des textes utilisateur dupliqués par le rendu de la page
    if (messages && messages.length > 0) {
      messages = messages.map((m) =>
        m.role === 'user' ? { role: 'user', text: collapseDuplicate(m.text) } : m
      );
    }

    let mode;
    let text;
    let imageFiles = [];
    let imageCount = 0;
    let imagesSeen = 0;
    if (messages && messages.length > 0) {
      mode = 'structured';
      // Capture des images : fichiers séparés (md/txt) ou embarquées (pdf)
      if (options.images !== false) {
        try {
          // Images affichées mais manquant des textes extraits (repli,
          // cartes d'aperçu) : ancrées à leur message quand c'est fiable.
          messages = harvestImages(messages, T.imagesSection, key);
          const captured = await captureImages(messages, fileBaseName(platform));
          messages = captured.messages;
          imageFiles = captured.images;
          imagesSeen = captured.seen;
        } catch (_) { /* les images restent des URL dans le texte */ }
      }
      text = format === 'txt'
        ? buildText(messages, meta, options.header !== false)
        : buildMarkdown(messages, meta, options.header !== false);
    } else {
      mode = 'raw';
      source = 'raw';
      text = buildRaw(format, meta);
    }

    let filename = null;
    if (format === 'pdf') {
      filename = `${fileBaseName(platform)}.pdf`;
      let pdfMessages = messages;
      if (mode === 'raw' && text) {
        pdfMessages = [{
          role: 'assistant',
          text: `**${meta.rawBlock}**\n\n${text}`
        }];
      }
      // Conversion des images en JPEG pour embarquement dans le PDF
      let pdfImages = [];
      if (imageFiles.length > 0) {
        const converted = await Promise.all(imageFiles.map((img) => toJpeg(img.blob)));
        pdfImages = imageFiles
          .map((img, idx) => (converted[idx]
            ? {
                filename: img.filename,
                bytes: converted[idx].bytes,
                width: converted[idx].width,
                height: converted[idx].height
              }
            : null))
          .filter(Boolean);
      }
      let bytes = null;
      try {
        bytes = globalThis.__AIChatExportPdf
          ? globalThis.__AIChatExportPdf.conversation(pdfMessages, meta, options.header !== false, pdfImages)
          : null;
      } catch (e) {
        bytes = null;
      }
      if (!bytes || !bytes.length) {
        return { ok: false, error: T.pdfFailed };
      }
      imageCount = pdfImages.length;
      downloadFile(bytes, filename, 'application/pdf');
    } else if (format === 'md' || format === 'txt') {
      filename = `${fileBaseName(platform)}.${format}`;
      downloadFile(text, filename, format === 'md' ? 'text/markdown' : 'text/plain');
      // Les images capturées arrivent en fichiers séparés, juste après.
      imageCount = imageFiles.length;
      for (const img of imageFiles) {
        await sleep(200); // laisse le navigateur enchaîner les téléchargements
        downloadFile(img.blob, img.filename, img.blob.type || 'image/png');
      }
    }

    return {
      ok: true,
      platform: key,
      platformLabel: platform.label,
      mode,
      source,
      count: messages ? messages.length : 0,
      images: imageCount,
      imagesSeen,
      filename,
      text,
      title: meta.title
    };
  }

  // ==================================================================
  // Messagerie avec le popup
  // ==================================================================
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'COPEX_PING') {
      sendResponse({ ok: true, platform: detectPlatform(location.hostname) });
      return;
    }
    if (msg.type === 'COPEX_EXPORT') {
      runExport(msg.format || 'md', msg.options || {})
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
      return true; // réponse asynchrone
    }
  });
})();
