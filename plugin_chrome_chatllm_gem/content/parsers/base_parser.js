/**
 * BaseParser - Interface et utilitaires partagés pour les parsers de chat
 */
class BaseParser {
  constructor(platformName) {
    this.platformName = platformName;
  }

  /**
   * Retourne le titre de la conversation actuelle
   */
  getConversationTitle() {
    // 1. Chercher un élément de titre spécifique dans le DOM
    const candidateSelectors = [
      '[data-testid="conversation-title"]',
      '[data-testid="chat-title"]',
      'header h1',
      'nav [aria-current="page"]',
      '.conversation-title',
      '.thread-title'
    ];

    for (const sel of candidateSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }

    // 2. Extraire de document.title
    let title = document.title || '';
    title = title.replace(/\s*-\s*(Claude|Google Gemini|Gemini|Microsoft Copilot|Copilot|Bing)\s*$/i, '').trim();

    if (!title || /^(copilot|gemini|claude|bing|nouveau chat|new chat)$/i.test(title)) {
      return `Conversation_${this.platformName}_${new Date().toISOString().slice(0, 10)}`;
    }

    return title;
  }

  /**
   * Trouve le conteneur défilable principal de la conversation
   */
  getScrollContainer() {
    // Par défaut, vérifie les conteneurs avec overflow-y scroll ou auto
    const candidates = [
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.querySelector('[role="feed"]'),
      document.querySelector('.chat-window'),
      document.querySelector('.infinite-scroller'),
      document.documentElement
    ];

    for (const el of candidates) {
      if (!el) continue;
      const style = window.getComputedStyle(el);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        return el;
      }
    }

    // Recherche récursive d'un conteneur qui défile
    const allDivs = document.querySelectorAll('div, main, section');
    for (const el of allDivs) {
      if (el.scrollHeight > el.clientHeight + 100) {
        const style = window.getComputedStyle(el);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          return el;
        }
      }
    }

    return document.scrollingElement || document.documentElement;
  }

  /**
   * Génère une clé unique stable pour dédupliquer les messages même avec virtualisation DOM
   */
  generateMessageId(node, role, textContent) {
    if (node && node.__chatllm_id) {
      return node.__chatllm_id;
    }

    // 1. Vérifier si un ID unique existe déjà dans les attributs HTML
    if (node) {
      const domId = node.id ||
                    node.getAttribute('data-message-id') ||
                    node.getAttribute('data-turn-id') ||
                    node.getAttribute('data-item-id');
      if (domId) {
        const id = `${role}_${domId}`;
        node.__chatllm_id = id;
        return id;
      }
    }

    // 2. Empreinte basée sur le contenu
    let preview = (textContent || '').trim().slice(0, 120).replace(/\s+/g, ' ');
    
    // Si le message est très court (ex: "Voici l'image"), on risque de fusionner tous ces messages.
    // On ajoute un hachage des attributs d'images pour les différencier, tout en évitant les URLs volatiles.
    if (preview.length < 100 && node && node.querySelectorAll) {
      const imgs = Array.from(node.querySelectorAll('img')).slice(0, 4);
      imgs.forEach(img => {
        const alt = img.getAttribute('alt') || '';
        // Utiliser l'alt s'il existe et est significatif (ex: prompt de l'image)
        if (alt && alt.length > 5) {
          preview += '_alt:' + alt.slice(0, 50);
        } else {
          // Sinon, on utilise un bout de l'URL, mais on enlève les paramètres changeants
          let src = img.currentSrc || img.getAttribute('src') || img.src || '';
          src = src.split('?')[0]; // Enlever les paramètres d'URL qui peuvent changer
          if (src.length > 30) {
            preview += '_src:' + src.slice(-30);
          }
        }
      });
    }

    const hash = this.simpleHash(preview);
    const len = (textContent || preview || '').length;
    const id = `${role}_h${hash}_l${len}`;

    if (node) {
      node.__chatllm_id = id;
    }
    return id;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Détecte spécifiquement les conteneurs de citations, sources de recherche web et listes de favicons
   */
  isSourcesOrAttribution(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const text = (node.textContent || '').trim();

    // Bloc textuel Sources
    if (/^(\*+\s*)?sources(\s*\*+)?$/i.test(text)) {
      return true;
    }
    if (/^sources\b/i.test(text) && text.length < 100) {
      return true;
    }

    // Classes et identifiants de citations / sources
    const classStr = `${node.className || ''} ${node.getAttribute('data-testid') || ''} ${node.id || ''}`.toLowerCase();
    if (/\b(attribution|citations?|sources?|source-card|reference-list|cib-attributions)\b/i.test(classStr)) {
      return true;
    }

    // Si le nœud contient des favicons (services.bingapis.com/favicon) avec peu de texte
    if (node.querySelector && node.querySelector('img[src*="services.bingapis.com/favicon"], img[src*="favicon"]')) {
      if (text.length < 120) return true;
    }

    return false;
  }

  /**
   * Vérifie si un élément DOM est un parasite d'interface (boutons d'action, suggestions, lecteurs d'écran)
   */
  isExtraneousElement(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;

    // Si le nœud est un conteneur de sources / citations / favicons : le rejeter !
    if (this.isSourcesOrAttribution(node)) {
      return true;
    }

    // Si le nœud contient une image valide (DALL-E, Imagen, upload utilisateur),
    // NE PAS le supprimer (ex: bouton ou conteneur interactif qui enveloppe l'image)
    if (node.querySelector) {
      const collectImgs = (root) => {
        let found = [];
        if (root.querySelectorAll) found.push(...Array.from(root.querySelectorAll('img')));
        if (root.shadowRoot) found.push(...collectImgs(root.shadowRoot));
        if (root.children) {
          for (const child of Array.from(root.children)) {
            if (child.shadowRoot) found.push(...collectImgs(child.shadowRoot));
          }
        }
        return found;
      };
      
      const allImgs = collectImgs(node);
      for (const img of allImgs) {
        if (this.isContentImage(img)) {
          return false; 
        }
      }
    }

    const tag = node.tagName.toLowerCase();
    const className = (typeof node.className === 'string' ? node.className : '') + ' ' + (node.getAttribute('class') || '');
    const text = (node.textContent || '').trim();

    // 1. Boutons d'action UI (copie, réaction, signalement, partage) sans image de contenu
    if (tag === 'button' || node.getAttribute('role') === 'button') {
      return true;
    }
    if (/copy-button|feedback|reaction|action-bar|vote-down|vote-up|thumbs|citation-pill|action-menu/i.test(className)) {
      return true;
    }

    // 2. Éléments d'accessibilité / lecteurs d'écran ("You said:", "Copilot said:", etc.)
    if (
      /sr-only|visually-hidden|screen-reader/i.test(className) ||
      (node.getAttribute('aria-hidden') === 'true' && !node.querySelector('img') && !node.classList.contains('katex-html'))
    ) {
      return true;
    }

    // Détection textuelle exacte ou quasi-exacte des en-têtes d'accessibilité
    if (/^(you said|copilot said|vous avez dit|user said|assistant said|human said)[:\s]*$/i.test(text)) {
      return true;
    }

    // 3. Suggestions, prompt starters, questions rapides proposées par l'IA
    if (/suggestion|prompt-chip|starter|quick-question|pill|follow-up|followup|related-search|try-asking/i.test(className)) {
      return true;
    }

    // 4. Notes de bas de page ou avertissements légaux LLM ("Les réponses peuvent être inexactes...")
    if (/disclaimer|footer-note|legal-notice/i.test(className)) {
      return true;
    }

    if (/Fournissez vos commentaires sur BizChat|Provide feedback on BizChat/i.test(text)) {
      return true;
    }
    
    if (/^favicon type$/i.test(text) || /^favicon$/i.test(text)) {
      return true;
    }

    return false;
  }

  /**
   * Trouve l'ancêtre d'un élément même à travers les frontières Shadow DOM
   */
  shadowClosest(element, selector) {
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      if (current.matches && current.matches(selector)) return current;
      if (current.assignedSlot) {
        current = current.assignedSlot;
      } else if (current.parentNode && current.parentNode.nodeType === 11) {
        current = current.parentNode.host;
      } else {
        current = current.parentNode;
      }
    }
    return null;
  }

  /**
   * Vérifie si un élément <img> fait véritablement partie du contenu de la conversation
   * (accepte DALL-E, Imagen, uploads; exclut favicons, vignettes de liens de recherche, badges)
   */
  isContentImage(img) {
    if (!img || img.tagName.toLowerCase() !== 'img') return false;

    let src = img.currentSrc || img.getAttribute('src') || img.src || '';
    
    // Si c'est un pixel de tracking ou une image vide, essayer data-src
    if (!src || src.startsWith('data:image/svg') || src.includes('data:image/gif;base64,R0lGOD') || src.startsWith('blob:null')) {
      const dataSrc = img.getAttribute('data-src');
      if (dataSrc) src = dataSrc;
    }

    if (!src) return false;

    // 1. Exclure immédiatement SVG, données vectorielles, balises de tracking
    if (src.startsWith('data:image/svg') || src.includes('data:image/gif;base64,R0lGOD') || src.startsWith('blob:null')) {
      return false;
    }

    // 2. REJET ABSOLU des favicons et miniatures de moteurs de recherche (Bing / Google)
    if (
      src.includes('services.bingapis.com/favicon') ||
      src.includes('favicon') ||
      src.includes('/s2/favicons') ||
      src.includes('tbn:ANd9Gc') ||
      /th\.bing\.com\/th\?id=ODLS/i.test(src) ||
      /th\.bing\.com\/th\?id=ODF/i.test(src) ||
      /th\.bing\.com\/th\?id=OSB/i.test(src)
    ) {
      return false;
    }

    // Rejet si l'image est dans un conteneur de sources / citations
    if (this.isSourcesOrAttribution(img) || this.shadowClosest(img, 'cib-attributions, [class*="attribution"], [class*="citation"], [class*="source"], [data-testid*="source"], [data-testid*="citation"]')) {
      return false;
    }

    // Rejet des logos, icônes, avatars
    const imgMeta = `${img.className || ''} ${img.id || ''} ${img.getAttribute('alt') || ''}`.toLowerCase();
    if (/\b(avatar|badge|icon|logo|spinner|emoji)\b/i.test(imgMeta) || imgMeta.includes('favicon')) {
      return false;
    }

    // 3. ACCEPTATION PRIORITAIRE DES VRAIES IMAGES DE CONVERSATION :
    // - DALL-E / Copilot Designer (th.bing.com/th/id/OIG... ou IG...)
    if (/th\.bing\.com\/th\/id\/(OIG|IG)/i.test(src)) {
      return true;
    }
    // - Google Gemini Imagen
    if (/googleusercontent\.com/i.test(src)) {
      return true;
    }
    // - Data URLs réelles (png, jpeg, webp, ou octet-stream pour Copilot) de taille substantielle (> 200 octets)
    if ((src.startsWith('data:image/') || src.startsWith('data:application/octet-stream')) && src.length > 200) {
      return true;
    }
    // - Blobs de navigateurs locaux
    if (src.startsWith('blob:')) {
      return true;
    }
    // - Images dans des conteneurs de média reconnus
    if (this.shadowClosest(img, 'cib-image-grid, cib-image-viewer, cib-attachment, [class*="image-grid"], [class*="designer"], [class*="generative"], [class*="attachment"], [class*="user-uploaded"], image-generation-container, .image-card')) {
      return true;
    }

    // 4. Si l'image est dans un lien externe (a[href]) vers un article ou site tiers (pas un visualiseur d'image)
    const parentLink = this.shadowClosest(img, 'a');
    if (parentLink) {
      const href = parentLink.getAttribute('href') || '';
      if (href && !href.startsWith('#') && !href.startsWith('blob:') && !href.startsWith('data:')) {
        if (!/(create|images|designer|\.(png|jpe?g|webp|gif))/i.test(href)) {
          return false;
        }
      }
    }

    // 5. Filtrage des petites icônes résiduelles (< 40px)
    const width = img.naturalWidth || img.width || img.offsetWidth || 0;
    const height = img.naturalHeight || img.height || img.offsetHeight || 0;
    if ((width > 0 && width < 40) && (height > 0 && height < 40)) {
      return false;
    }

    return true;
  }

  /**
   * Clone un nœud DOM et supprime tous les éléments parasites avant traitement
   */
  cleanClone(rootElement) {
    if (!rootElement) return null;
    const clone = rootElement.cloneNode(true);

    // Synchroniser les URLs d'images rǸelles (currentSrc est perdu dans le clone)
    const originalImgs = Array.from(rootElement.querySelectorAll('img'));
    const cloneImgs = Array.from(clone.querySelectorAll('img'));
    for (let i = 0; i < originalImgs.length; i++) {
      if (cloneImgs[i]) {
        const bestSrc = originalImgs[i].currentSrc || originalImgs[i].getAttribute('src') || originalImgs[i].getAttribute('data-src') || originalImgs[i].src || '';
        if (bestSrc) {
          cloneImgs[i].setAttribute('src', bestSrc);
        }
      }
    }

    // Supprimer tous les conteneurs de sources et citations
    clone.querySelectorAll(
      'cib-attributions, [class*="attribution"], [class*="citation"], [class*="source"], [data-testid*="source"], [data-testid*="citation"]'
    ).forEach(el => el.remove());

    const allElements = Array.from(clone.querySelectorAll('*'));
    for (const el of allElements) {
      if (this.isSourcesOrAttribution(el)) {
        el.remove();
        continue;
      }
      if (this.isExtraneousElement(el)) {
        el.remove();
        continue;
      }

      // Supprimer les en-têtes h1-h6 parasites qui contiennent "You said" / "Copilot said"
      if (/^h[1-6]$/i.test(el.tagName)) {
        const text = (el.textContent || '').trim();
        if (/^(you said|copilot said|vous avez dit|assistant said|user said)[:\s]*$/i.test(text)) {
          el.remove();
          continue;
        }
      }
    }

    return clone;
  }

  /**
   * Déduplique une liste d'objets images selon leur URL / source normalisée
   */
  deduplicateImages(images) {
    if (!images || !Array.isArray(images)) return [];
    const seen = new Set();
    const result = [];

    for (const img of images) {
      if (!img || !img.src) continue;
      let normSrc = img.src.trim();
      try {
        if (normSrc.startsWith('http')) {
          const urlObj = new URL(normSrc);
          const volatileParams = ['X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires', 'X-Amz-SignedHeaders', 'X-Amz-Signature', 'se', 'sp', 'sv', 'sr', 'sig', 'token'];
          volatileParams.forEach(p => urlObj.searchParams.delete(p));
          normSrc = urlObj.toString();
        }
      } catch (e) {
        // Fallback
      }

      if (!seen.has(normSrc)) {
        seen.add(normSrc);
        result.push(img);
      }
    }
    return result;
  }

  /**
   * Convertit un nœud DOM HTML en Markdown propre (GFM)
   */
  domToMarkdown(rootElement) {
    if (!rootElement) return '';

    const processNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      // Ignorer les éléments parasites d'interface
      if (this.isExtraneousElement(node)) {
        return '';
      }

      const tag = node.tagName.toLowerCase();

      // Traitement spécial KaTeX / Math
      if (node.classList.contains('katex')) {
        const texAnnotation = node.querySelector('annotation[encoding="application/x-tex"]');
        if (texAnnotation) {
          const isDisplay = node.classList.contains('katex-display');
          return isDisplay ? `\n$$\n${texAnnotation.textContent}\n$$\n` : `$${texAnnotation.textContent}$`;
        }
      }

      // Blocs de code
      if (tag === 'pre') {
        const codeEl = node.querySelector('code') || node;
        let lang = '';
        const classNames = (codeEl.className || '') + ' ' + (node.className || '');
        const langMatch = classNames.match(/language-([a-zA-Z0-9_\-#+]+)/i);
        if (langMatch) lang = langMatch[1];
        
        // Nettoyer les boutons de copie à l'intérieur
        const clone = codeEl.cloneNode(true);
        clone.querySelectorAll('button, .copy-code-button, svg').forEach(b => b.remove());
        const codeText = clone.textContent.replace(/^\n+|\n+$/g, '');
        return `\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`;
      }

      if (tag === 'code' && node.parentElement && node.parentElement.tagName.toLowerCase() !== 'pre') {
        return `\`${node.textContent}\``;
      }

      // Paragraphes
      if (tag === 'p') {
        const inner = Array.from(node.childNodes).map(processNode).join('');
        return `\n\n${inner.trim()}\n\n`;
      }

      // Titres (h1 à h6)
      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag[1], 10);
        const prefix = '#'.repeat(level);
        const inner = Array.from(node.childNodes).map(processNode).join('').trim();
        // Ignorer les titres parasites d'accessibilité
        if (!inner || /^(you said|copilot said|vous avez dit|assistant said|user said)[:\s]*$/i.test(inner)) {
          return '';
        }
        return `\n\n${prefix} ${inner}\n\n`;
      }

      // Gras / Italique / Barré
      if (tag === 'strong' || tag === 'b') {
        return `**${Array.from(node.childNodes).map(processNode).join('')}**`;
      }
      if (tag === 'em' || tag === 'i') {
        return `*${Array.from(node.childNodes).map(processNode).join('')}*`;
      }
      if (tag === 's' || tag === 'del' || tag === 'strike') {
        return `~~${Array.from(node.childNodes).map(processNode).join('')}~~`;
      }

      // Boutons : si le bouton enveloppe une image (générée ou uploadée), extraire les enfants
      if (tag === 'button' || node.getAttribute('role') === 'button') {
        if (node.querySelector('img')) {
          return Array.from(node.childNodes).map(processNode).join('');
        }
        return '';
      }

      // Liens
      if (tag === 'a') {
        // Si le lien enveloppe une image (ex. zoom ou lien Designer)
        if (node.querySelector('img')) {
          return Array.from(node.childNodes).map(processNode).join('');
        }
        const href = node.getAttribute('href') || '';
        const linkText = Array.from(node.childNodes).map(processNode).join('').trim();
        return href ? `[${linkText || href}](${href})` : linkText;
      }

      // Images : filtrer impérativement les miniatures de liens, favicons et badges
      if (tag === 'img') {
        if (!this.isContentImage(node)) {
          return '';
        }
        const src = node.currentSrc || node.getAttribute('src') || node.getAttribute('data-src') || node.src || '';
        let alt = (node.getAttribute('alt') || 'Image').trim();
        alt = alt.replace(/[\[\]\(\)]/g, ' ');
        if (src) {
          // Si c'est une image data URL volumineuse, la basculer dans la galerie de fin pour ne pas polluer/crasher le regex
          if ((src.startsWith('data:') || src.startsWith('blob:')) && src.length > 200) {
            return `\n\n*(Image : ${alt})*\n\n`;
          }
          return `\n\n![${alt}](${src})\n\n`;
        }
        return '';
      }

      // Listes
      if (tag === 'ul') {
        const items = Array.from(node.children)
          .filter(c => c.tagName.toLowerCase() === 'li')
          .map(li => `- ${Array.from(li.childNodes).map(processNode).join('').trim()}`)
          .join('\n');
        return `\n\n${items}\n\n`;
      }

      if (tag === 'ol') {
        let index = 1;
        const items = Array.from(node.children)
          .filter(c => c.tagName.toLowerCase() === 'li')
          .map(li => `${index++}. ${Array.from(li.childNodes).map(processNode).join('').trim()}`)
          .join('\n');
        return `\n\n${items}\n\n`;
      }

      // Citations
      if (tag === 'blockquote') {
        const inner = Array.from(node.childNodes).map(processNode).join('').trim();
        const quoted = inner.split('\n').map(line => `> ${line}`).join('\n');
        return `\n\n${quoted}\n\n`;
      }

      // Tableaux
      if (tag === 'table') {
        return this.tableToMarkdown(node);
      }

      // Sauts de ligne
      if (tag === 'br') {
        return '\n';
      }
      if (tag === 'hr') {
        return '\n\n---\n\n';
      }

      // Par défaut, parcourir récursivement les enfants
      return Array.from(node.childNodes).map(processNode).join('');
    };

    let md = processNode(rootElement);
    
    // Nettoyage agressif final sur la chane markdown pour Ǹliminer les rǸsidus persistants
    md = md.replace(/^(You said|Copilot said|vous avez dit|assistant said|user said)[\s:]*\n?/gmi, '');
    md = md.replace(/Favicon type/gmi, '');
    md = md.replace(/^Sources\s*$/gmi, '');
    md = md.replace(/Fournissez vos commentaires sur BizChat/gmi, '');
    
    // Nettoyer les sauts de lignes multiples (> 2)
    md = md.replace(/\n{3,}/g, '\n\n').trim();
    return md;
  }

  /**
   * Convertit une table HTML en tableau Markdown
   */
  tableToMarkdown(tableNode) {
    const rows = Array.from(tableNode.querySelectorAll('tr'));
    if (!rows.length) return '';

    const parsedRows = rows.map(tr => {
      const cells = Array.from(tr.querySelectorAll('th, td'));
      return cells.map(c => c.textContent.trim().replace(/\|/g, '\\|').replace(/\n/g, ' '));
    });

    const colCount = Math.max(...parsedRows.map(r => r.length));
    if (colCount === 0) return '';

    const lines = [];
    const headerRow = parsedRows[0] || [];
    while (headerRow.length < colCount) headerRow.push('');
    lines.push(`| ${headerRow.join(' | ')} |`);
    lines.push(`| ${headerRow.map(() => '---').join(' | ')} |`);

    for (let i = 1; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      while (row.length < colCount) row.push('');
      lines.push(`| ${row.join(' | ')} |`);
    }

    return `\n\n${lines.join('\n')}\n\n`;
  }
}

window.BaseParser = BaseParser;
