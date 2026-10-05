/**
 * ImageProcessor - Convertit et télécharge les images (uploadées & générées)
 * Supporte le cache, la conversion canvas, fetch local et relais Service Worker (CORS).
 */
class ImageProcessor {
  constructor() {
    this.imageCache = new Map(); // url -> { dataUrl, blob, mimeType, extension }
  }

  static getCanonicalUrl(src) {
    if (!src || typeof src !== 'string') return '';
    try {
      if (src.startsWith('http')) {
        const u = new URL(src);
        const volatileParams = ['X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires', 'X-Amz-SignedHeaders', 'X-Amz-Signature', 'se', 'sp', 'sv', 'sr', 'sig', 'token'];
        volatileParams.forEach(p => u.searchParams.delete(p));
        return u.toString();
      }
    } catch (_) {}
    return src.trim();
  }

  /**
   * Traite toutes les images d'une liste de messages avec rapport de progression
   * @param {Array} messages - Liste des messages
   * @param {Function} onProgress - Callback (current, total, statusText)
   */
  async processAllImages(messages, onProgress) {
    // 1. Rassembler toutes les images uniques
    const allImages = [];
    const seenUrls = new Set();
    messages.forEach(msg => {
      if (msg.images && msg.images.length > 0) {
        msg.images.forEach(img => {
          const key = ImageProcessor.getCanonicalUrl(img.src);
          if (key && !seenUrls.has(key)) {
            seenUrls.add(key);
            allImages.push(img);
          }
        });
      }
    });

    const total = allImages.length;
    if (total === 0) {
      if (onProgress) onProgress(0, 0, 'Aucune image trouvée');
      return;
    }

    let processed = 0;
    for (const img of allImages) {
      if (onProgress) {
        onProgress(processed, total, `Conversion de l'image ${processed + 1} / ${total}...`);
      }

      try {
        const imageResult = await this.convertImage(img.src);
        this.imageCache.set(img.src, imageResult);
        const canonKey = ImageProcessor.getCanonicalUrl(img.src);
        if (canonKey && canonKey !== img.src) {
          this.imageCache.set(canonKey, imageResult);
        }
        img.dataUrl = imageResult.dataUrl;
        img.mimeType = imageResult.mimeType;
        img.extension = imageResult.extension;
      } catch (err) {
        console.warn('Impossible de convertir l\'image:', img.src, err);
      }
      processed++;
    }

    // Réinjecter les données d'image dans chaque message
    messages.forEach(msg => {
      if (msg.images) {
        msg.images.forEach((img, idx) => {
          let cached = this.imageCache.get(img.src);
          if (!cached) {
            const key = ImageProcessor.getCanonicalUrl(img.src);
            cached = this.imageCache.get(key);
            if (!cached) {
              for (const [cSrc, cVal] of this.imageCache.entries()) {
                if (ImageProcessor.getCanonicalUrl(cSrc) === key) {
                  cached = cVal;
                  break;
                }
              }
            }
          }
          if (cached) {
            img.dataUrl = cached.dataUrl;
            img.mimeType = cached.mimeType;
            img.extension = cached.extension;
            img.filename = `image_${String(idx + 1).padStart(2, '0')}.${cached.extension}`;
          }
        });
      }
    });

    if (onProgress) {
      onProgress(total, total, 'Toutes les images ont été traitées');
    }
  }

  /**
   * Convertit une URL d'image en Base64 Data URL et Blob
   */
  async convertImage(src) {
    if (this.imageCache.has(src)) {
      return this.imageCache.get(src);
    }

    // Cas 1 : Déjà en Data URL
    if (src.startsWith('data:image/') || src.startsWith('data:application/octet-stream')) {
      let dataUrl = src;
      if (src.startsWith('data:application/octet-stream')) {
        dataUrl = src.replace('data:application/octet-stream', 'data:image/png');
      }
      const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z0-9+]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      const extension = this.getExtensionFromMime(mimeType);
      return { dataUrl: dataUrl, mimeType, extension };
    }

    // Cas 2 : Tentative via élément Image du DOM (Canvas)
    try {
      const canvasResult = await this.convertViaCanvas(src);
      if (canvasResult) return canvasResult;
    } catch (e) {
      // Poursuivre vers fetch
    }

    // Cas 3 : Fetch direct depuis le content script
    try {
      const resp = await fetch(src, { mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        const dataUrl = await this.blobToDataUrl(blob);
        const mimeType = blob.type || 'image/png';
        return {
          dataUrl,
          mimeType,
          extension: this.getExtensionFromMime(mimeType)
        };
      }
    } catch (e) {
      // Poursuivre vers le service worker
    }

    // Cas 4 : Relais par le Background Service Worker (contournement CORS)
    try {
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchImageAsBase64', url: src }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Erreur inconnue du service worker'));
          }
        });
      });

      if (res && res.dataUrl) {
        return {
          dataUrl: res.dataUrl,
          mimeType: res.mimeType || 'image/png',
          extension: this.getExtensionFromMime(res.mimeType || 'image/png')
        };
      }
    } catch (err) {
      console.warn('Échec du relais service worker pour l\'image:', src, err);
    }

    // Repli : renvoyer l'URL source telle quelle
    return {
      dataUrl: src,
      mimeType: 'image/png',
      extension: 'png'
    };
  }

  /**
   * Conversion via Canvas si l'image est déjà chargée dans le DOM
   */
  convertViaCanvas(src) {
    return new Promise((resolve, reject) => {
      // Chercher si l'image existe déjà dans le DOM
      let existingImg = document.querySelector(`img[src="${CSS.escape(src)}"]`);
      
      const img = existingImg && existingImg.complete && existingImg.naturalWidth > 0 
        ? existingImg 
        : new Image();

      const onImageReady = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 300;
          canvas.height = img.naturalHeight || img.height || 300;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          resolve({
            dataUrl,
            mimeType: 'image/png',
            extension: 'png'
          });
        } catch (err) {
          // Erreur de sécurité si canvas est "tainted" par CORS
          reject(err);
        }
      };

      if (existingImg && existingImg.complete && existingImg.naturalWidth > 0) {
        onImageReady();
      } else {
        img.crossOrigin = 'anonymous';
        img.onload = onImageReady;
        img.onerror = reject;
        img.src = src;
      }
    });
  }

  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  getExtensionFromMime(mimeType) {
    const map = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg'
    };
    return map[mimeType] || 'png';
  }
}

window.ImageProcessor = ImageProcessor;
