/**
 * Overlay - Interface utilisateur flottante intégrée dans la page web
 */
class ChatLLMOverlay {
  constructor(platformName, parser) {
    this.platformName = platformName;
    this.parser = parser;
    this.scroller = new window.ChatScroller(parser);
    this.imageProcessor = new window.ImageProcessor();
    this.isExtracting = false;

    this.init();
  }

  init() {
    // Éviter injection multiple
    if (document.getElementById('chatllm-root')) return;

    const extVersion = (window.chrome && chrome.runtime?.getManifest)
      ? chrome.runtime.getManifest().version
      : '1.3.1';

    const root = document.createElement('div');
    root.id = 'chatllm-root';
    root.innerHTML = `
      <div id="chatllm-panel">
        <div class="chatllm-header">
          <div class="chatllm-title-wrap">
            <span class="chatllm-title">ChatLLM Exporter</span>
            <span class="chatllm-badge">${this.platformName}</span>
            <span class="chatllm-version" style="font-size: 11px; opacity: 0.65; margin-left: 6px; font-weight: normal;">v${extVersion}</span>
          </div>
          <button id="chatllm-btn-close" class="chatllm-close" title="Fermer">&times;</button>
        </div>

        <div class="chatllm-body">
          <div>
            <div class="chatllm-group-title">Format d'exportation</div>
            <div class="chatllm-options">
              <label class="chatllm-radio-label">
                <input type="radio" name="chatllm-format" value="md_inline" checked>
                <div class="chatllm-opt-info">
                  <span class="chatllm-opt-title">Markdown autonome (.md)</span>
                  <span class="chatllm-opt-desc">Fichier unique avec images Base64 intégrées</span>
                </div>
              </label>

              <label class="chatllm-radio-label">
                <input type="radio" name="chatllm-format" value="md_zip">
                <div class="chatllm-opt-info">
                  <span class="chatllm-opt-title">Markdown + Images (.zip)</span>
                  <span class="chatllm-opt-desc">Archive contenant conversation.md et dossier images/</span>
                </div>
              </label>

              <label class="chatllm-radio-label">
                <input type="radio" name="chatllm-format" value="pdf">
                <div class="chatllm-opt-info">
                  <span class="chatllm-opt-title">Document PDF (.pdf)</span>
                  <span class="chatllm-opt-desc">Mise en page haute fidélité avec impression PDF</span>
                </div>
              </label>

              <label class="chatllm-radio-label">
                <input type="radio" name="chatllm-format" value="txt">
                <div class="chatllm-opt-info">
                  <span class="chatllm-opt-title">Texte brut (.txt)</span>
                  <span class="chatllm-opt-desc">Texte simple sans balises de mise en forme</span>
                </div>
              </label>
            </div>
          </div>

          <div>
            <div class="chatllm-group-title">Défilement & Historique</div>
            <div class="chatllm-options">
              <label class="chatllm-radio-label">
                <input type="radio" name="chatllm-scroll" value="full" checked>
                <div class="chatllm-opt-info">
                  <span class="chatllm-opt-title">Défilement automatique complet</span>
                  <span class="chatllm-opt-desc">Recommandé : charge tous les messages de la conversation</span>
                </div>
              </label>

              <label class="chatllm-radio-label">
                <input type="radio" name="chatllm-scroll" value="quick">
                <div class="chatllm-opt-info">
                  <span class="chatllm-opt-title">Capture rapide</span>
                  <span class="chatllm-opt-desc">Uniquement les messages déjà visibles à l'écran</span>
                </div>
              </label>
            </div>
          </div>

          <div>
            <label class="chatllm-checkbox-label">
              <input type="checkbox" id="chatllm-include-images" checked>
              <span>Extraire les images (envoyées & générées)</span>
            </label>
          </div>

          <!-- Barre de progression -->
          <div id="chatllm-progress-box" class="chatllm-progress-box">
            <div class="chatllm-progress-bar-bg">
              <div id="chatllm-progress-fill" class="chatllm-progress-bar-fill"></div>
            </div>
            <div id="chatllm-status-text" class="chatllm-status-text">Initialisation...</div>
            <div id="chatllm-count-text" class="chatllm-count-text">0 messages détectés</div>
          </div>

          <div class="chatllm-actions">
            <button id="chatllm-btn-start" class="chatllm-btn-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Démarrer l'extraction</span>
            </button>
            <button id="chatllm-btn-stop" class="chatllm-btn-secondary">
              Arrêter et exporter maintenant
            </button>
          </div>
        </div>
      </div>

      <!-- Bouton Flottant (FAB) -->
      <button id="chatllm-fab" title="Exporter la conversation (${this.platformName})">
        <svg viewBox="0 0 24 24">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
      </button>
    `;

    document.body.appendChild(root);
    this.bindEvents();
  }

  bindEvents() {
    const fab = document.getElementById('chatllm-fab');
    const panel = document.getElementById('chatllm-panel');
    const closeBtn = document.getElementById('chatllm-btn-close');
    const startBtn = document.getElementById('chatllm-btn-start');
    const stopBtn = document.getElementById('chatllm-btn-stop');

    fab.addEventListener('click', () => {
      panel.classList.toggle('active');
    });

    closeBtn.addEventListener('click', () => {
      panel.classList.remove('active');
    });

    stopBtn.addEventListener('click', () => {
      if (this.scroller) {
        this.scroller.abort();
        stopBtn.textContent = 'Finalisation de l\'export en cours...';
      }
    });

    startBtn.addEventListener('click', () => this.handleStartExtraction());
  }

  async handleStartExtraction() {
    if (this.isExtracting) return;
    this.isExtracting = true;

    const startBtn = document.getElementById('chatllm-btn-start');
    const stopBtn = document.getElementById('chatllm-btn-stop');
    const progressBox = document.getElementById('chatllm-progress-box');
    const progressFill = document.getElementById('chatllm-progress-fill');
    const statusText = document.getElementById('chatllm-status-text');
    const countText = document.getElementById('chatllm-count-text');

    const selectedFormat = document.querySelector('input[name="chatllm-format"]:checked')?.value || 'md_inline';
    const scrollMode = document.querySelector('input[name="chatllm-scroll"]:checked')?.value || 'full';
    const includeImages = document.getElementById('chatllm-include-images')?.checked ?? true;

    startBtn.disabled = true;
    startBtn.innerHTML = '<span>Extraction en cours...</span>';
    progressBox.classList.add('active');
    stopBtn.classList.add('active');
    stopBtn.textContent = 'Arrêter et exporter maintenant';

    try {
      // 1. Récupération des messages avec le Scroller
      const messages = await this.scroller.harvestFullConversation({
        quickMode: scrollMode === 'quick',
        onProgress: ({ status, current, percent }) => {
          statusText.textContent = status;
          countText.textContent = `${current} message(s) capturé(s)`;
          progressFill.style.width = `${percent}%`;
        }
      });

      if (!messages || messages.length === 0) {
        alert('Aucun message détecté. Assurez-vous d\'être sur une conversation active.');
        return;
      }

      // 2. Traitement des images si activé
      if (includeImages) {
        // 2a. Artefacts blob: (planches générées rendues en liens de
        // téléchargement) : à récupérer tant que la page vit.
        try {
          await this.imageProcessor.resolveBlobArtifacts(messages, (cur, tot, m) => {
            statusText.textContent = m;
          });
        } catch (e) {
          console.warn('Résolution des artefacts blob: impossible', e);
        }
        statusText.textContent = 'Traitement et téléchargement des images...';
        progressFill.style.width = '85%';
        await this.imageProcessor.processAllImages(messages, (current, total, msg) => {
          statusText.textContent = msg;
          countText.textContent = `${current} / ${total} image(s) traitée(s)`;
        });
      } else {
        // Nettoyer les images des messages si désactivé
        messages.forEach(m => m.images = []);
      }

      progressFill.style.width = '95%';
      statusText.textContent = 'Génération du fichier...';

      // 3. Métadonnées d'export
      const metadata = {
        title: this.parser.getConversationTitle(),
        platform: this.platformName,
        exportDate: new Date().toLocaleString()
      };

      // 4. Exportation selon le format choisi
      switch (selectedFormat) {
        case 'md_inline':
          window.MdFormatter.downloadSingleFile(messages, metadata);
          break;
        case 'md_zip':
          await window.MdFormatter.downloadZip(messages, metadata);
          break;
        case 'pdf':
          window.PdfFormatter.exportPdf(messages, metadata);
          break;
        case 'txt':
          window.TxtFormatter.download(messages, metadata);
          break;
      }

      progressFill.style.width = '100%';
      statusText.textContent = '✅ Export terminé avec succès !';
      countText.textContent = `${messages.length} messages exportés.`;

    } catch (err) {
      console.error('Erreur lors de l\'exportation:', err);
      statusText.textContent = `❌ Erreur : ${err.message || err}`;
    } finally {
      this.isExtracting = false;
      startBtn.disabled = false;
      startBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Démarrer l'extraction</span>
      `;
      stopBtn.classList.remove('active');
    }
  }
}

window.ChatLLMOverlay = ChatLLMOverlay;
