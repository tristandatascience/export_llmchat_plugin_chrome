/**
 * GeminiParser - Parser spécialisé pour Google Gemini (gemini.google.com)
 */
class GeminiParser extends BaseParser {
  constructor() {
    super('Gemini');
  }

  getScrollContainer() {
    const selectors = [
      'infinite-scroller',
      '.chat-history',
      'chat-window',
      '.chat-window-content',
      'main .overflow-y-auto',
      'main'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight) {
        return el;
      }
    }
    return super.getScrollContainer();
  }

  getConversationTitle() {
    const titleEl = document.querySelector('.conversation-title, .title-input, [data-test-id="conversation-title"]');
    if (titleEl) {
      const val = titleEl.value || titleEl.textContent;
      if (val && val.trim()) return val.trim();
    }
    return super.getConversationTitle();
  }

  extractVisibleMessages(container) {
    const root = container || document;
    const messages = [];

    // Recherche des balises personnalisées standard de Gemini : <user-query> et <model-response>
    const allTurns = root.querySelectorAll('user-query, model-response, [data-test-id="user-query"], [data-test-id="model-response"]');

    if (allTurns.length > 0) {
      let idx = 0;
      for (const turn of allTurns) {
        const tagName = turn.tagName.toLowerCase();
        const testId = turn.getAttribute('data-test-id') || '';
        const isUser = tagName === 'user-query' || testId.includes('user-query');
        const role = isUser ? 'user' : 'assistant';
        const msg = this.parseGeminiNode(turn, role, idx++);
        if (msg) messages.push(msg);
      }
      return messages;
    }

    // Sélecteur de repli pour différentes versions de l'interface Gemini
    const queryContainers = root.querySelectorAll('.query-container, .response-container, .conversation-turn');
    let idx = 0;
    for (const item of queryContainers) {
      const isUser = item.classList.contains('query-container') || item.querySelector('.user-query-container');
      const role = isUser ? 'user' : 'assistant';
      const msg = this.parseGeminiNode(item, role, idx++);
      if (msg) messages.push(msg);
    }

    return messages;
  }

  parseGeminiNode(node, role, index) {
    if (!node) return null;

    // 1. Déterminer le conteneur de contenu et nettoyer le clone
    const contentTarget = node.querySelector('.message-content, .model-response-text, .query-text') || node;
    const cleanNode = this.cleanClone(contentTarget);
    if (!cleanNode) return null;

    // 2. Extraire les images valides (exclure favicons, miniatures Google Search et icônes)
    const rawImages = [];
    const imgEls = node.querySelectorAll('img');

    imgEls.forEach(img => {
      if (!this.isContentImage(img)) {
        return;
      }
      const src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || img.src || '';
      if (!src) return;

      rawImages.push({
        src: src,
        alt: img.getAttribute('alt') || (role === 'user' ? 'Image utilisateur' : 'Image générée Gemini'),
        isUserUpload: role === 'user',
        isGenerated: role === 'assistant'
      });
    });

    const images = this.deduplicateImages(rawImages);

    // 3. Extraire le contenu texte/markdown depuis le clone nettoyé
    const md = this.domToMarkdown(cleanNode);
    const plainText = cleanNode.textContent.trim();

    if (!plainText && images.length === 0) {
      return null;
    }

    const id = this.generateMessageId(node, role, plainText);

    return {
      id,
      role,
      authorName: role === 'user' ? 'Vous' : 'Gemini',
      text: plainText,
      markdown: md,
      images,
      timestamp: new Date().toLocaleTimeString()
    };
  }
}

window.GeminiParser = GeminiParser;
