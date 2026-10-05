/**
 * ClaudeParser - Parser spécialisé pour Claude.ai
 */
class ClaudeParser extends BaseParser {
  constructor() {
    super('Claude');
  }

  getScrollContainer() {
    // Claude utilise un conteneur principal à défilement dans le panneau central
    const selectors = [
      '[data-testid="chat-scroll-container"]',
      'main .overflow-y-auto',
      'div.overflow-y-auto',
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
    // Recherche du titre du chat dans la barre supérieure ou document.title
    const titleEl = document.querySelector('[data-testid="chat-title"], header button span.truncate, h1.truncate');
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }
    return super.getConversationTitle();
  }

  /**
   * Extrait tous les messages actuellement visibles dans le DOM
   */
  extractVisibleMessages(container) {
    const messages = [];

    // Claude structure ses messages par tours de discussion
    // Sélecteurs pour identifier les tours de message utilisateur et claude
    const turnElements = (container || document).querySelectorAll(
      '[data-test-render-count], [data-testid="user-message"], .font-user-message, .font-claude-message, [data-message-author-slug]'
    );

    // Si on a des tours avec data-message-author-slug
    const messageContainers = (container || document).querySelectorAll('div[data-message-author-slug]');

    if (messageContainers.length > 0) {
      let idx = 0;
      for (const el of messageContainers) {
        const authorSlug = el.getAttribute('data-message-author-slug');
        const role = authorSlug === 'human' ? 'user' : 'assistant';
        const msg = this.parseClaudeMessageNode(el, role, idx++);
        if (msg) messages.push(msg);
      }
      return messages;
    }

    // Sélecteur alternatif : blocs utilisateur et blocs claude
    const userNodes = (container || document).querySelectorAll('.font-user-message, [data-testid="user-message"]');
    const assistantNodes = (container || document).querySelectorAll('.font-claude-message, .standard-markdown');

    // On parcourt tous les conteneurs de rangée dans l'ordre du DOM
    const allMessageCandidates = (container || document).querySelectorAll(
      '.group.relative, [data-testid="user-message"], .font-claude-message'
    );

    // Analyse générale par ordre dans le document
    const items = [];
    const processedNodes = new Set();

    for (const cand of allMessageCandidates) {
      // Éviter d'analyser un parent ou un sous-noeud déjà traité
      if (processedNodes.has(cand)) continue;

      const isUser = cand.classList.contains('font-user-message') ||
                     cand.querySelector('.font-user-message') ||
                     cand.getAttribute('data-testid') === 'user-message';

      const isAssistant = cand.classList.contains('font-claude-message') ||
                          cand.querySelector('.font-claude-message') ||
                          cand.querySelector('.standard-markdown');

      if (isUser) {
        const targetNode = cand.classList.contains('font-user-message') ? cand : (cand.querySelector('.font-user-message') || cand);
        const msg = this.parseClaudeMessageNode(targetNode, 'user', items.length);
        if (msg) {
          items.push(msg);
          processedNodes.add(cand);
        }
      } else if (isAssistant) {
        const targetNode = cand.classList.contains('font-claude-message') ? cand : (cand.querySelector('.font-claude-message') || cand);
        const msg = this.parseClaudeMessageNode(targetNode, 'assistant', items.length);
        if (msg) {
          items.push(msg);
          processedNodes.add(cand);
        }
      }
    }

    return items;
  }

  parseClaudeMessageNode(node, role, index) {
    if (!node) return null;

    // 1. Cloner et nettoyer le nœud
    const cleanNode = this.cleanClone(node);
    if (!cleanNode) return null;

    // 2. Extraire les images valides (exclure avatars, logos et icônes)
    const rawImages = [];
    const parentContainer = node.closest('.group') || node.parentElement || node;
    const imgEls = parentContainer.querySelectorAll('img');

    imgEls.forEach(img => {
      if (!this.isContentImage(img)) {
        return;
      }
      const src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || img.src || '';
      if (!src) return;

      rawImages.push({
        src: src,
        alt: img.getAttribute('alt') || (role === 'user' ? 'Image utilisateur' : 'Image générée'),
        isUserUpload: role === 'user',
        isGenerated: role === 'assistant'
      });
    });

    const images = this.deduplicateImages(rawImages);

    // 3. Extraire le markdown depuis le clone nettoyé
    const md = this.domToMarkdown(cleanNode);
    const plainText = cleanNode.textContent.trim();

    if (!plainText && images.length === 0) {
      return null;
    }

    const id = this.generateMessageId(node, role, plainText);

    return {
      id,
      role,
      authorName: role === 'user' ? 'Vous' : 'Claude',
      text: plainText,
      markdown: md,
      images,
      timestamp: new Date().toLocaleTimeString()
    };
  }
}

window.ClaudeParser = ClaudeParser;
