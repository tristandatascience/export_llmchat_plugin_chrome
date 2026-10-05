/**
 * Service Worker pour ChatLLM Exporter (Manifest V3)
 * Gère les téléchargements, le relais de récupération d'images (CORS) et les clics sur l'icône de l'action.
 */

// Écoute des messages venant des content scripts ou popups
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchImageAsBase64') {
    fetchImageAsBase64(request.url)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Indique une réponse asynchrone
  }

  if (request.action === 'openPrintPage') {
    chrome.tabs.create({ url: chrome.runtime.getURL('print/print.html') }, (tab) => {
      sendResponse({ success: true, tabId: tab?.id });
    });
    return true;
  }
  
  if (request.action === 'setPendingExportData') {
    chrome.storage.local.set({ pendingExportData: request.data })
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'downloadFile') {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename,
      saveAs: request.saveAs || false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true;
  }
});

// Récupère une image distante et la convertit en Base64 Data URL (contourne les restrictions CORS du content script)
async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Échec HTTP: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve({
          dataUrl: reader.result,
          mimeType: blob.type || 'image/png'
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Erreur lors du téléchargement de l\'image:', url, err);
    throw err;
  }
}
