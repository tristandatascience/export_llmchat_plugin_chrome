/**
 * Content Script Principal - Détection de plateforme et initialisation
 */
(function() {
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('claude.ai')) {
      return { name: 'Claude', parser: new window.ClaudeParser() };
    }
    if (host.includes('gemini.google.com') || host.includes('bard.google.com')) {
      return { name: 'Gemini', parser: new window.GeminiParser() };
    }
    if (host.includes('copilot.com') || host.includes('copilot.microsoft.com') || host.includes('copilot.cloud.microsoft') || host.includes('bing.com')) {
      return { name: 'Copilot', parser: new window.CopilotParser() };
    }
    return null;
  }

  function init() {
    const platform = detectPlatform();
    if (!platform) {
      return;
    }

    console.log(`[ChatLLM Exporter] Plateforme détectée : ${platform.name}`);
    window.chatLLMInstance = new window.ChatLLMOverlay(platform.name, platform.parser);
  }

  // Lancement après chargement du DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Support des applications SPA lors des changements d'URL
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Réactualisation si besoin lors d'un changement de conversation
      if (!document.getElementById('chatllm-root')) {
        init();
      }
    }
  });

  observer.observe(document, { subtree: true, childList: true });
})();
