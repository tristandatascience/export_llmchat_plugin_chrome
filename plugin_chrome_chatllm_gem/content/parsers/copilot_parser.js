/**
 * CopilotParser - Parser spécialisé pour Microsoft Copilot (copilot.microsoft.com & bing.com/chat)
 */
class CopilotParser extends BaseParser {
  constructor() {
    super('Copilot');
  }

  getScrollContainer() {
    const selectors = [
      '[role="feed"]',
      '[data-testid="chat-scroll-container"]',
      'div[class*="chat-scroll"]',
      'div[class*="messages-container"]',
      'div[class*="conversation"]',
      'main .overflow-y-auto',
      'div.scrollable-container',
      '#b_content',
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
    const titleEl = document.querySelector('header h1, [data-testid="chat-title"], [data-testid="conversation-title"], .thread-title, h1');
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }
    return super.getConversationTitle();
  }

  determineRole(turn) {
    if (!turn) return null;

    // 1. Attributs explicites prioritaires
    const dataContent = (turn.getAttribute('data-content') || '').toLowerCase();
    if (dataContent === 'user-message' || dataContent.includes('user')) return 'user';
    if (dataContent === 'ai-message' || dataContent.includes('ai') || dataContent.includes('assistant')) return 'assistant';

    const authorAttr = (turn.getAttribute('data-message-author') || '').toLowerCase();
    if (authorAttr === 'user' || authorAttr === 'human') return 'user';
    if (authorAttr === 'assistant' || authorAttr === 'bot' || authorAttr === 'copilot') return 'assistant';

    const testId = (turn.getAttribute('data-testid') || '').toLowerCase();
    if (testId.includes('user')) return 'user';
    if (testId.includes('assistant') || testId.includes('ai-message')) return 'assistant';

    // 2. Classes CSS sur le nœud lui-même
    const className = (turn.className || '').toLowerCase();
    if (/\buser(-|_)?message\b/i.test(className) || className.includes('usermessage')) return 'user';
    if (/\b(ai|assistant|copilot)(-|_)?message\b/i.test(className) || className.includes('aimessage') || className.includes('copilotmessage')) return 'assistant';

    // 3. Test direct matches
    if (turn.matches && turn.matches('[data-content="user-message"], [class*="userMessage"], [class*="UserMessage"], [data-testid="user-message"]')) {
      return 'user';
    }
    if (turn.matches && turn.matches('[data-content="ai-message"], [class*="aiMessage"], [class*="CopilotMessage"], [data-testid="assistant-message"]')) {
      return 'assistant';
    }

    // 4. Recherche dans les enfants
    if (turn.querySelector('[data-content="user-message"], [data-testid*="user"], [class*="userMessage"], [class*="UserMessage"]')) {
      return 'user';
    }
    if (turn.querySelector('[data-content="ai-message"], [data-testid*="assistant"], [class*="aiMessage"], [class*="CopilotMessage"]')) {
      return 'assistant';
    }

    // 5. Cib-chat-turn
    const source = (turn.getAttribute('source') || '').toLowerCase();
    if (source === 'user') return 'user';
    if (source === 'bot') return 'assistant';

    return null;
  }

  extractVisibleMessages(container) {
    const root = container || document;
    const messages = [];

    // 1. Détection ciblée des messages réels Copilot (copilot.com et copilot.microsoft.com)
    const turnElements = root.querySelectorAll(
      '[data-content="user-message"], [data-content="ai-message"], ' +
      '[data-testid="user-message"], [data-testid="assistant-message"], ' +
      '[data-message-author="user"], [data-message-author="assistant"], ' +
      'div[class*="userMessage"], div[class*="aiMessage"], div[class*="assistantMessage"], ' +
      'div[class*="UserMessage"], div[class*="CopilotMessage"], ' +
      'cib-chat-turn, div.chat-turn, div[class*="chat-turn"]'
    );

    // Filtrer pour éliminer les conteneurs parents, les barres d'outils, les suggestions et les sources/favicons
    const rawElements = Array.from(turnElements).filter(el => {
      if (el.closest(
        'header, footer, nav, aside, [class*="suggestion"], [class*="sidebar"], [class*="composer"], [class*="input-container"], ' +
        'cib-attributions, [class*="attribution"], [class*="source"], [data-testid*="source"], [data-testid*="citation"]'
      )) {
        return false;
      }
      return true;
    });

    const filteredTurns = rawElements.filter(el => {
      return !rawElements.some(other => other !== el && el.contains(other));
    });

    if (filteredTurns.length > 0) {
      let idx = 0;
      for (const turn of filteredTurns) {
        // Exclure formellement les blocs de sources / attributions / favicons
        if (this.isSourcesOrAttribution(turn) || this.isExtraneousElement(turn)) {
          continue;
        }

        const role = this.determineRole(turn);
        if (!role) {
          // Rejeter tout élément sans rôle certain pour ne pas inventer de messages
          continue;
        }

        const msg = this.parseCopilotNode(turn, role, idx++);
        if (msg) messages.push(msg);
      }
      if (messages.length > 0) return messages;
    }

    // 2. Gestion pour l'ancienne interface ou shadow DOM (cib-serp, cib-conversation)
    const shadowHost = document.querySelector('cib-serp');
    if (shadowHost && shadowHost.shadowRoot) {
      return this.extractFromShadowDOM(shadowHost.shadowRoot);
    }

    // 3. Repli ciblé uniquement si aucun message principal n'a été détecté
    const fallbackTurns = root.querySelectorAll('.message-item, .chat-bubble, [data-author]');
    let idx = 0;
    for (const item of fallbackTurns) {
      if (this.isSourcesOrAttribution(item) || this.isExtraneousElement(item)) continue;
      const role = this.determineRole(item);
      if (!role) continue;
      const msg = this.parseCopilotNode(item, role, idx++);
      if (msg) messages.push(msg);
    }

    return messages;
  }

  /**
   * Traverse le shadow DOM de Bing Chat / Copilot si présent
   */
  extractFromShadowDOM(shadowRoot) {
    const messages = [];
    try {
      const conv = shadowRoot.querySelector('cib-conversation');
      const convRoot = conv?.shadowRoot || shadowRoot;
      const chatTurns = convRoot.querySelectorAll('cib-chat-turn');

      let idx = 0;
      for (const turn of chatTurns) {
        const turnRoot = turn.shadowRoot || turn;
        // User turn
        const userGroup = turnRoot.querySelector('cib-message-group[source="user"]');
        if (userGroup) {
          const userRoot = userGroup.shadowRoot || userGroup;
          const msg = this.parseCopilotNode(userRoot, 'user', idx++);
          if (msg) messages.push(msg);
        }
        // Bot turn
        const botGroup = turnRoot.querySelector('cib-message-group[source="bot"]');
        if (botGroup) {
          const botRoot = botGroup.shadowRoot || botGroup;
          const msg = this.parseCopilotNode(botRoot, 'assistant', idx++);
          if (msg) messages.push(msg);
        }
      }
    } catch (e) {
      console.warn('Erreur lors de la lecture Shadow DOM Copilot:', e);
    }
    return messages;
  }

  parseCopilotNode(node, role, index) {
    if (!node) return null;

    // 1. Cloner et nettoyer le nœud via BaseParser.cleanClone
    const clone = this.cleanClone(node);
    if (!clone) return null;

    // 2. Nettoyage spécifique Copilot :
    // Supprimer les répétitions du prompt utilisateur et le texte d'interface dans les widgets de génération Designer
    // (ex. <h1>genere moi une image de lapin cretin</h1> ou barres d'état)
    if (role === 'assistant') {
      // Nettoyer les conteneurs Designer / Image-grid : ne garder QUE les images, supprimer tout texte d'interface
      clone.querySelectorAll('cib-image-grid, [class*="image-grid"], [class*="designer"], [class*="image-card"], image-generation-container, [class*="image-container"]').forEach(container => {
        container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, div, button').forEach(el => {
          if (!el.querySelector('img') && el.tagName.toLowerCase() !== 'img') {
            el.remove();
          }
        });
      });

      // Supprimer tout en-tête h1-h6 isolé qui reprendrait le prompt dans la réponse de l'assistant
      clone.querySelectorAll('h1, h2, h3, [class*="prompt"], [class*="query-text"], [class*="prompt-title"]').forEach(heading => {
        if (!heading.querySelector('img')) {
          heading.remove();
        }
      });
    }

    // 3. Extraire les images valides (DALL-E / Designer, uploads utilisateur)
    const rawImages = [];
    
    // Fonction récursive pour chercher les images y compris dans les shadow roots
    const collectAllImgs = (root) => {
      let imgs = [];
      if (root.querySelectorAll) imgs.push(...Array.from(root.querySelectorAll('img')));
      if (root.shadowRoot) imgs.push(...collectAllImgs(root.shadowRoot));
      if (root.children) {
        for (const child of Array.from(root.children)) {
          if (child.shadowRoot) imgs.push(...collectAllImgs(child.shadowRoot));
        }
      }
      return imgs;
    };
    
    const imgEls = collectAllImgs(node);

    imgEls.forEach(img => {
      if (!this.isContentImage(img)) {
        return;
      }
      const src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || img.src || '';
      if (!src) return;

      rawImages.push({
        src: src,
        alt: img.getAttribute('alt') || (role === 'user' ? 'Image utilisateur' : 'Image générée Copilot'),
        isUserUpload: role === 'user',
        isGenerated: role === 'assistant'
      });
    });

    // Si aucune image n'a été trouvée directement dans le nœud pour l'assistant
    // (ex: conteneur Designer adjacent dans le tour de chat)
    if (rawImages.length === 0 && role === 'assistant') {
      const turnParent = node.closest('cib-chat-turn, div[class*="chat-turn"], div[class*="turn-"], [role="presentation"]');
      if (turnParent) {
        // Exclure formellement toute image se trouvant dans une zone message utilisateur
        const userSubContainers = Array.from(turnParent.querySelectorAll(
          '[data-content="user-message"], [data-testid="user-message"], div[class*="userMessage"], cib-message-group[source="user"]'
        ));

        const parentImgs = Array.from(turnParent.querySelectorAll('img')).filter(img => {
          if (!this.isContentImage(img)) return false;
          if (userSubContainers.some(u => u.contains(img))) return false;
          return true;
        });

        parentImgs.forEach(img => {
          const src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || img.src || '';
          if (src) {
            rawImages.push({
              src: src,
              alt: img.getAttribute('alt') || 'Image générée Copilot',
              isUserUpload: false,
              isGenerated: true
            });
          }
        });
      }
    }

    // Dédupliquer les images pour ne pas inclure plusieurs fois la même image
    const images = this.deduplicateImages(rawImages);

    // 4. Extraire le texte et markdown depuis le clone nettoyé
    const md = this.domToMarkdown(clone);
    const plainText = clone.textContent.trim();

    if (!plainText && images.length === 0) {
      return null;
    }

    const id = this.generateMessageId(node, role, plainText);

    return {
      id,
      role,
      authorName: role === 'user' ? 'Vous' : 'Copilot',
      text: plainText,
      markdown: md,
      images,
      timestamp: new Date().toLocaleTimeString()
    };
  }
}

window.CopilotParser = CopilotParser;
