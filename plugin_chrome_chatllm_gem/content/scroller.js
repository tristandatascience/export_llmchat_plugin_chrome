/**
 * Scroller - Gestionnaire de défilement automatique & collecteur incrémental
 * Résout les problèmes de virtualisation DOM et de chargement progressif (infinite scroll)
 */
class ChatScroller {
  constructor(parser) {
    this.parser = parser;
    this.isAborted = false;
    this.isRunning = false;
  }

  /**
   * Arrête le défilement automatique
   */
  abort() {
    this.isAborted = true;
  }

  /**
   * Sélecteurs des conteneurs de messages utilisateur (light DOM + shadow DOM)
   */
  getUserContainers() {
    const containers = Array.from(document.querySelectorAll(
      '[data-content="user-message"], [data-testid="user-message"], [data-message-author="user"], ' +
      'div[class*="userMessage"], div[class*="UserMessage"], ' +
      '[data-content="user"], [data-testid*="user"]'
    ));
    // Parcours du shadow DOM (ancienne interface cib-*)
    for (const serp of Array.from(document.querySelectorAll('cib-serp'))) {
      if (!serp.shadowRoot) continue;
      for (const turn of Array.from(serp.shadowRoot.querySelectorAll('cib-chat-turn'))) {
        const turnRoot = turn.shadowRoot || turn;
        containers.push(...Array.from(turnRoot.querySelectorAll('cib-message-group[source="user"]')));
      }
    }
    return containers;
  }

  /**
   * Repère les contrôles qui déplient les galeries d'images multiples dans
   * un conteneur de message utilisateur (seule la 1re image est affichée,
   * les suivantes sont masquées derrière « +N », « voir plus », etc.).
   */
  findGalleryExpanders(container) {
    const out = [];
    const scan = (root) => {
      if (!root || !root.querySelectorAll) return;
      for (const el of Array.from(root.querySelectorAll('button, [role="button"], [aria-expanded], div, span, a'))) {
        // Déjà traité : l'élément marqué lui-même, un ancêtre marqué, OU un
        // descendant marqué (la div enveloppe de la pastille a le même
        // texte « 2 images » ; la cliquer replierait la galerie).
        if (el.closest && (el.closest('[data-chatllm-gallery]')
          || (el.querySelector && el.querySelector('[data-chatllm-gallery]')))) {
          continue;
        }
        const text = (el.textContent || '').trim();
        const label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
        // Ne JAMAIS cliquer un contrôle de repli (« Afficher moins » après
        // dépliage) : on replierait les images qu'on vient d'ouvrir.
        if (/(afficher moins|show less|voir moins|réduire|masquer|hide|collapse)/i.test(text + ' ' + label)) {
          continue;
        }
        const isNumericBadge = /^\+\s*\d+(\s*(images?|photos?|img|fichiers?|files?|pièces?))?$/.test(text)
          || /^\+\s*\d+/.test(label);
        const isLabelled = label.length > 2 && label.length < 70
          && /(afficher|voir|montrer|déplier|développer|expand|show|view|more|galerie|gallery|image|photo|attach)/i.test(label);
        const isTextBadge = text.length > 0 && text.length < 30
          && /^(\+\s*\d+|\d+\s*(images?|photos?)|voir plus|voir tout|afficher plus|show more|view all)$/i.test(text);
        const ariaCollapsedWithImages = el.getAttribute('aria-expanded') === 'false'
          && el.parentElement && el.parentElement.querySelector
          && el.parentElement.querySelector('img');
        // Les pills de galerie (« 2 images » + chevron) sont souvent des
        // div/span sans rôle bouton : le texte exact suffit à les cliquer.
        const isClickable = el.tagName.toLowerCase() === 'button'
          || el.getAttribute('role') === 'button'
          || el.hasAttribute('aria-expanded')
          || isTextBadge
          || isNumericBadge;
        if (!isClickable) continue;
        if (isNumericBadge || isLabelled || isTextBadge || ariaCollapsedWithImages) {
          out.push(el);
        }
      }
      if (root.children) {
        for (const child of Array.from(root.children)) {
          if (child.shadowRoot) scan(child.shadowRoot);
        }
      }
    };
    scan(container);
    // Ne garder que l'élément le plus profond : la div qui enveloppe la
    // pastille a le même textContent (« 2 images ») et le cliquer en plus
    // de la pastille replierait la galerie aussitôt dépliée.
    return out.filter(el => !out.some(other => other !== el && el.contains(other)));
  }

  /**
   * Clique une fois sur chaque déplieur de galerie trouvé dans les messages
   * utilisateur. Renvoie true si au moins un clic a été fait (le rendu des
   * images cachées demande un instant avant la capture).
   */
  async expandUserGalleries() {
    let clicked = 0;
    for (const uc of this.getUserContainers()) {
      for (const btn of this.findGalleryExpanders(uc)) {
        try {
          btn.dataset.chatllmGallery = 'true';
          btn.click();
          clicked++;
          await new Promise(r => setTimeout(r, 350));
        } catch (_) { /* élément mort : on continue */ }
      }
    }
    return clicked > 0;
  }

  /**
   * Effectue un parcours complet (Haut -> Bas) pour s'assurer que l'intégralité
   * de la conversation et toutes les images sont chargées et capturées.
   *
   * @param {Object} options
   * @param {Function} options.onProgress - Callback ({ current, status, percent })
   * @returns {Promise<Array>} Liste ordonnée de tous les messages capturés
   */
  async harvestFullConversation({ onProgress, quickMode = false } = {}) {
    this.isAborted = false;
    this.isRunning = true;

    const container = this.parser.getScrollContainer();
    const isDoc = container === document.documentElement || container === document.body;

    const getScrollTop = () => isDoc ? window.scrollY : container.scrollTop;
    const setScrollTop = (val) => {
      if (isDoc) {
        window.scrollTo({ top: val, behavior: 'instant' });
      } else {
        container.scrollTop = val;
      }
    };
    const getScrollHeight = () => isDoc ? document.documentElement.scrollHeight : container.scrollHeight;
    const getClientHeight = () => isDoc ? window.innerHeight : container.clientHeight;

    const messageMap = new Map(); // id -> message
    const messageOrder = [];     // liste ordonnée des identifiants

    const harvestVisible = () => {
      const visible = this.parser.extractVisibleMessages(container);
      for (const msg of visible) {
        if (!messageMap.has(msg.id)) {
          messageMap.set(msg.id, msg);
          messageOrder.push(msg.id);
        } else {
          // Mettre à jour si des images ou contenus additionnels sont apparus
          const existing = messageMap.get(msg.id);
          if (msg.images && msg.images.length > 0) {
            const combined = [...(existing.images || []), ...msg.images];
            existing.images = this.parser.deduplicateImages ? this.parser.deduplicateImages(combined) : combined;
          }
          if ((msg.text && msg.text.length > (existing.text || '').length) || 
              (msg.markdown && msg.markdown.length > (existing.markdown || '').length) ||
              (msg.markdown && msg.markdown !== existing.markdown)) {
            existing.text = msg.text || existing.text;
            existing.markdown = msg.markdown || existing.markdown;
          }
        }
      }
    };

    // Mode rapide : capture uniquement ce qui est visible actuellement sans scroller
    if (quickMode) {
      harvestVisible();
      this.isRunning = false;
      return messageOrder.map(id => messageMap.get(id));
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    try {
      // ----------------------------------------------------
      // Étape 1 : Remonter progressivement jusqu'au début
      // ----------------------------------------------------
      if (onProgress) {
        onProgress({
          status: 'Phase 1/2 : Recherche du début de la conversation...',
          current: messageMap.size,
          percent: 15
        });
      }

      let previousTop = getScrollTop();
      let topStableCount = 0;
      let maxUpSteps = 500; // Supporte de très longues conversations (500 * 600px)

      while (!this.isAborted && topStableCount < 8 && maxUpSteps-- > 0) {
        setScrollTop(Math.max(0, getScrollTop() - 600));
        await sleep(600);

        const currentTop = getScrollTop();
        if (currentTop <= 5 || currentTop === previousTop) {
          topStableCount++;
          await sleep(1200); // Laisser le temps à l'application d'injecter l'historique
        } else {
          topStableCount = 0;
        }
        previousTop = currentTop;

        if (onProgress) {
          onProgress({
            status: 'Remontée vers le début de la conversation...',
            current: 0,
            percent: 25
          });
        }
      }

      // Petite pause pour stabiliser le début de page
      await sleep(1000);

      // Réinitialiser la liste d'ordre pour la descente chronologique
      messageOrder.length = 0;
      messageMap.clear();

      // ----------------------------------------------------
      // Étape 2 : Défiler progressivement vers le bas et capturer
      // ----------------------------------------------------
      if (onProgress) {
        onProgress({
          status: 'Phase 2/2 : Défilement et capture chronologique des messages...',
          current: 0,
          percent: 30
        });
      }

      let bottomStableCount = 0;
      let maxDownSteps = 1000; // Supporte de très longues conversations

      while (!this.isAborted && bottomStableCount < 8 && maxDownSteps-- > 0) {
        harvestVisible();

        // Dépliage des galeries d'images utilisateur (« +N images ») :
        // les images cachées obtiennent leur src, la capture suivante les
        // attribue à leur message naturellement.
        if (await this.expandUserGalleries()) {
          await sleep(700); // laisse le rendu des images dépliées se faire
          harvestVisible();
        }

        const scrollHeight = getScrollHeight();
        const clientHeight = getClientHeight();
        const currentTop = getScrollTop();

        // Avancer d'un demi-écran pour ne rater aucun message virtualisé
        const step = Math.max(300, Math.floor(clientHeight * 0.65));
        setScrollTop(currentTop + step);
        await sleep(600);

        const newTop = getScrollTop();
        const isAtBottom = (newTop + clientHeight) >= (getScrollHeight() - 25);

        if (isAtBottom || newTop === currentTop) {
          bottomStableCount++;
          // Pause pour laisser les nouveaux messages / images s'injecter
          await sleep(1500);
        } else {
          bottomStableCount = 0;
        }

        const currentHeight = getScrollHeight();
        const progressPercent = Math.min(95, Math.floor(30 + ((newTop + clientHeight) / (currentHeight || 1)) * 65));

        if (onProgress) {
          onProgress({
            status: `Capture en cours... (${messageMap.size} messages récupérés)`,
            current: messageMap.size,
            percent: progressPercent
          });
        }
      }

      // Capture finale tout en bas
      harvestVisible();

      // ----------------------------------------------------
      // Étape 3 : Passe finale - galeries d'images multiples repliées
      // (uploads utilisateur). Les déplieurs détectés pendant la descente
      // ont déjà été cliqués ; ici on ratisse large une dernière fois et
      // on récolte aussi les images de lightbox/modale.
      // ----------------------------------------------------
      if (onProgress) {
        onProgress({
          status: 'Phase 3/3 : Extraction spécifique des galeries d\'images cachées...',
          current: messageMap.size,
          percent: 95
        });
      }

      setScrollTop(0);
      await sleep(1000);

      let phase3Steps = 120;
      while (!this.isAborted && phase3Steps-- > 0) {
        const userContainers = this.getUserContainers();

        for (const uc of userContainers) {
          const expanders = this.findGalleryExpanders(uc);
          if (expanders.length === 0) continue;

          for (const btn of expanders) {
            btn.dataset.chatllmGallery = 'true';
            btn.click();
            await sleep(800);

            // 1) Les images dépliées dans le message lui-même : la
            //    capture suivante les prendra (attribution naturelle).
            // 2) Lightbox / modale ouverte par le clic : on rattache ses
            //    images au message qui CONTIENT le bouton cliqué.
            const lightboxImgs = [];
            const roots = [document, document.querySelector('cib-serp')?.shadowRoot].filter(Boolean);
            for (const r of roots) {
              const allImgs = Array.from(r.querySelectorAll(
                'div[class*="lightbox"] img, cib-lightbox img, div[role="dialog"] img, ' +
                'div[class*="overlay"] img, div[class*="carousel"] img, [id*="lightbox"] img'
              ));
              lightboxImgs.push(...allImgs.filter(img => this.parser.isContentImage(img)));
            }
            if (lightboxImgs.length > 0) {
              let targetMsgId = uc.__chatllm_id || null;
              if (!targetMsgId) {
                const turn = uc.closest('cib-chat-turn, div[class*="chat-turn"], [class*="turn-"]');
                targetMsgId = turn ? turn.__chatllm_id : null;
              }
              if (targetMsgId && messageMap.has(targetMsgId)) {
                const msg = messageMap.get(targetMsgId);
                const newImgs = lightboxImgs.map(img => ({
                  src: img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || img.src || '',
                  alt: img.getAttribute('alt') || 'Image galerie',
                  isUserUpload: true,
                  isGenerated: false
                }));
                msg.images = this.parser.deduplicateImages
                  ? this.parser.deduplicateImages([...(msg.images || []), ...newImgs])
                  : [...(msg.images || []), ...newImgs];
              } else if (lightboxImgs.length > 0) {
                // Sans ID résolu : au moins les réinjecter dans le
                // dernier message utilisateur connu.
                for (let k = messageOrder.length - 1; k >= 0; k--) {
                  const m = messageMap.get(messageOrder[k]);
                  if (m && m.role === 'user') {
                    const newImgs = lightboxImgs.map(img => ({
                      src: img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || img.src || '',
                      alt: img.getAttribute('alt') || 'Image galerie',
                      isUserUpload: true,
                      isGenerated: false
                    }));
                    m.images = this.parser.deduplicateImages
                      ? this.parser.deduplicateImages([...(m.images || []), ...newImgs])
                      : [...(m.images || []), ...newImgs];
                    break;
                  }
                }
              }
            }

            // Fermeture de la modale éventuelle
            const closeBtns = [];
            for (const r of roots) {
              closeBtns.push(...Array.from(r.querySelectorAll(
                'button[aria-label*="close" i], button[aria-label*="fermer" i], button[class*="close" i]'
              )));
              const cibLightbox = r.querySelector('cib-lightbox');
              if (cibLightbox && cibLightbox.shadowRoot) {
                closeBtns.push(...Array.from(cibLightbox.shadowRoot.querySelectorAll('button')));
              }
            }
            if (closeBtns.length > 0) {
              closeBtns[0].click();
            } else {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
            }
            await sleep(600);
          }
        }

        // Capture après dépliage pour absorber les images devenues visibles
        harvestVisible();

        const scrollHeight = getScrollHeight();
        const clientHeight = getClientHeight();
        const currentTop = getScrollTop();
        if ((currentTop + clientHeight) >= (scrollHeight - 25)) {
           break;
        }
        setScrollTop(currentTop + clientHeight * 0.65);
        await sleep(500);
      }

    } finally {
      this.isRunning = false;
    }

    // Reconstruction de la liste ordonnée
    return messageOrder.map(id => messageMap.get(id));
  }
}

window.ChatScroller = ChatScroller;
