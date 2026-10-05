/**
 * Popup Script - Détecte l'onglet actif et contrôle l'ouverture du panneau d'export
 */
document.addEventListener('DOMContentLoaded', async () => {
  const statusIcon = document.getElementById('status-icon');
  const statusTitle = document.getElementById('status-title');
  const statusDesc = document.getElementById('status-desc');
  const activeActions = document.getElementById('active-actions');
  const inactiveActions = document.getElementById('inactive-actions');
  const toggleBtn = document.getElementById('btn-toggle-overlay');

  // Synchronisation dynamique du tag de version
  const versionTag = document.querySelector('.version-tag');
  if (versionTag && chrome.runtime?.getManifest) {
    versionTag.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';

    let platform = null;
    if (url.includes('claude.ai')) {
      platform = 'Claude';
    } else if (url.includes('gemini.google.com') || url.includes('bard.google.com')) {
      platform = 'Gemini';
    } else if (url.includes('copilot.com') || url.includes('copilot.microsoft.com') || url.includes('copilot.cloud.microsoft') || url.includes('bing.com')) {
      platform = 'Copilot';
    }

    if (platform) {
      statusIcon.textContent = '🟢';
      statusTitle.textContent = `${platform} détecté`;
      statusDesc.textContent = 'Prêt pour l\'extraction complète';
      activeActions.style.display = 'flex';
      inactiveActions.style.display = 'none';

      toggleBtn.addEventListener('click', () => {
        // Envoie un message pour ouvrir le panel ou clique sur le bouton de la page
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const panel = document.getElementById('chatllm-panel');
            if (panel) {
              panel.classList.add('active');
            }
          }
        });
        window.close();
      });
    } else {
      statusIcon.textContent = '⚪';
      statusTitle.textContent = 'Aucun chat détecté';
      statusDesc.textContent = 'Ouvrez Claude, Gemini ou Copilot';
      activeActions.style.display = 'none';
      inactiveActions.style.display = 'flex';
    }
  } catch (err) {
    statusIcon.textContent = '⚠️';
    statusTitle.textContent = 'Information';
    statusDesc.textContent = 'Impossible de lire l\'onglet actuel';
  }
});
