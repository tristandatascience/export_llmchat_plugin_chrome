/**
 * PdfFormatter - Générateur de document stylisé pour impression et export PDF haute fidélité
 */
class PdfFormatter {
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
   * Génère le HTML complet prêt à l'impression / PDF
   */
  static generateHtml(messages, metadata = {}) {
    const { title = 'Conversation', platform = 'ChatLLM', exportDate = new Date().toLocaleString() } = metadata;

    const messagesHtml = messages.map((msg, idx) => {
      const isUser = msg.role === 'user';
      const roleClass = isUser ? 'user-bubble' : 'ai-bubble';
      const badgeClass = isUser ? 'badge-user' : 'badge-ai';
      const author = isUser ? '👤 Utilisateur' : `🤖 ${msg.authorName || 'Assistant'}`;
      
      let bodyHtml = '';
      if (msg.markdown) {
        bodyHtml = PdfFormatter.markdownToHtml(msg.markdown);
      } else {
        bodyHtml = `<p>${PdfFormatter.escapeHtml(msg.text || '')}</p>`;
      }

      if (msg.images && msg.images.length > 0) {
        msg.images.forEach(img => {
          if (img.src && img.dataUrl && bodyHtml.includes(img.src)) {
            bodyHtml = bodyHtml.split(img.src).join(img.dataUrl);
          }
        });
      }

      // Dédupliquer les images du message
      const uniqueImages = [];
      const seenSources = new Set();
      if (msg.images && msg.images.length > 0) {
        msg.images.forEach(img => {
          const key = PdfFormatter.getCanonicalUrl(img.src);
          if (key && !seenSources.has(key)) {
            seenSources.add(key);
            uniqueImages.push(img);
          }
        });
      }

      // Ne pas dupliquer dans imagesHtml les images déjà présentes dans bodyHtml
      const unplacedImages = uniqueImages.filter(img => {
        const src = img.src || '';
        const dataUrl = img.dataUrl || '';
        return (!src || !bodyHtml.includes(src)) && (!dataUrl || !bodyHtml.includes(dataUrl));
      });

      let imagesHtml = '';
      if (unplacedImages.length > 0) {
        imagesHtml = `
          <div class="message-images">
            ${unplacedImages.map((img, i) => `
              <div class="image-card">
                <img src="${img.dataUrl || img.src}" alt="${PdfFormatter.escapeHtml(img.alt || 'image')}" />
                ${img.alt ? `<span class="image-caption">${PdfFormatter.escapeHtml(img.alt)}</span>` : ''}
              </div>
            `).join('')}
          </div>
        `;
      }

      // Planches / fichiers PDF générés par l'IA : aperçu intégré cliquable
      let artifactsHtml = '';
      if (msg.artifacts && msg.artifacts.length > 0) {
        artifactsHtml = msg.artifacts.filter(a => a.kind === 'pdf' && a.dataUrl).map(a => `
          <div class="pdf-artifact">
            <object type="application/pdf" data="${a.dataUrl}" width="100%" height="820">
              <embed type="application/pdf" src="${a.dataUrl}" width="100%" height="820" />
            </object>
            <span class="image-caption">📄 ${PdfFormatter.escapeHtml(a.title)} &mdash; <a href="${a.dataUrl}" download="planche.pdf">ouvrir / télécharger le PDF</a></span>
          </div>
        `).join('');
      }

      return `
        <div class="chat-message ${roleClass}">
          <div class="message-header">
            <span class="badge ${badgeClass}">${author}</span>
            <span class="message-time">#${idx + 1} &bull; ${msg.timestamp || ''}</span>
          </div>
          <div class="message-body">
            ${bodyHtml}
          </div>
          ${imagesHtml}
          ${artifactsHtml}
        </div>
      `;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${PdfFormatter.escapeHtml(title)} - Export PDF</title>
  <style>
    :root {
      --primary-color: #2563eb;
      --bg-color: #f8fafc;
      --card-bg: #ffffff;
      --text-main: #1e293b;
      --text-muted: #64748b;
      --border-color: #e2e8f0;
      --code-bg: #0f172a;
      --code-text: #e2e8f0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: var(--text-main);
      background: var(--bg-color);
      padding: 24px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    .print-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #1e293b;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .print-btn {
      background: #2563eb;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    .print-btn:hover {
      background: #1d4ed8;
    }
    .doc-header {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .doc-header h1 {
      font-size: 24px;
      margin-bottom: 8px;
      color: #0f172a;
    }
    .meta-tags {
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: var(--text-muted);
    }
    .chat-message {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 18px 20px;
      margin-bottom: 16px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .user-bubble {
      border-left: 4px solid #3b82f6;
      background: #f0f7ff;
    }
    .ai-bubble {
      border-left: 4px solid #10b981;
      background: #ffffff;
    }
    .message-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      border-bottom: 1px solid rgba(0,0,0,0.05);
      padding-bottom: 6px;
    }
    .badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 20px;
    }
    .badge-user {
      background: #dbeafe;
      color: #1e40af;
    }
    .badge-ai {
      background: #d1fae5;
      color: #065f46;
    }
    .message-time {
      font-size: 12px;
      color: var(--text-muted);
    }
    .message-body {
      font-size: 14.5px;
      overflow-wrap: break-word;
    }
    .message-body p {
      margin-bottom: 10px;
    }
    .message-body pre {
      background: var(--code-bg);
      color: var(--code-text);
      padding: 12px 16px;
      border-radius: 6px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      margin: 12px 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .message-body code {
      background: #f1f5f9;
      color: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
    }
    .message-body pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }
    .message-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 13.5px;
    }
    .message-body th, .message-body td {
      border: 1px solid var(--border-color);
      padding: 8px 12px;
      text-align: left;
    }
    .message-body th {
      background: #f1f5f9;
    }
    .message-body ul, .message-body ol {
      margin-left: 24px;
      margin-bottom: 10px;
    }
    .message-images {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .image-card {
      max-width: 100%;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--border-color);
      background: #fff;
    }
    .image-card img {
      max-width: 100%;
      max-height: 480px;
      display: block;
      object-fit: contain;
    }
    .image-caption {
      display: block;
      padding: 4px 8px;
      font-size: 12px;
      color: var(--text-muted);
      background: #f8fafc;
    }
    .pdf-artifact {
      margin-top: 14px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      overflow: hidden;
      background: #fff;
    }
    .pdf-artifact object,
    .pdf-artifact embed {
      display: block;
      margin: 0 auto;
    }
    @media print {
      body {
        background: #fff;
        padding: 0;
      }
      .print-bar {
        display: none !important;
      }
      .chat-message {
        break-inside: avoid;
        page-break-inside: avoid;
        box-shadow: none;
      }
      @page {
        margin: 15mm;
        size: auto;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="print-bar">
      <span>🖨️ Document prêt pour l'exportation PDF</span>
      <button class="print-btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
    </div>

    <header class="doc-header">
      <h1>${PdfFormatter.escapeHtml(title)}</h1>
      <div class="meta-tags">
        <span><strong>Plateforme :</strong> ${PdfFormatter.escapeHtml(platform)}</span>
        <span><strong>Date :</strong> ${PdfFormatter.escapeHtml(exportDate)}</span>
        <span><strong>Messages :</strong> ${messages.length}</span>
      </div>
    </header>

    <main class="chat-flow">
      ${messagesHtml}
    </main>
  </div>
</body>
</html>`;
  }

  /**
   * Ouvre la fenêtre d'impression PDF via la page dédiée de l'extension (sans restrictions CSP)
   */
  static async exportPdf(messages, metadata = {}) {
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'setPendingExportData', data: { messages, metadata } }, (setRes) => {
          if (chrome.runtime.lastError || !setRes?.success) {
            reject(new Error('Erreur de sauvegarde des données: ' + (chrome.runtime.lastError?.message || setRes?.error)));
          } else {
            resolve();
          }
        });
      });

      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'openPrintPage' }, (res) => {
          if (chrome.runtime.lastError || !res?.success) {
            window.open(chrome.runtime.getURL('print/print.html'), '_blank');
          }
          resolve();
        });
      });
    } catch (e) {
      console.warn('Erreur ouverture page impression extension, repli fichier HTML:', e);
      const html = PdfFormatter.generateHtml(messages, metadata);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const dateStr = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
      downloadBlob(blob, `${sanitizeFilename(metadata.title || 'conversation')}_${dateStr}_export.html`);
    }
  }

  static escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  static markdownToHtml(md) {
    if (!md) return '';
    let html = md;

    // Supprimer les en-têtes parasites d'accessibilité (You said / Copilot said / Vous avez dit)
    html = html.replace(/^(#{1,6}\s*(You said:|Copilot said:|Vous avez dit :).*?(\n|$))/gim, '');
    html = html.replace(/^(\s*(You said:|Copilot said:|Vous avez dit :)[:\s]*(\n|$))/gim, '');

    // Blocs de code
    html = html.replace(/```([a-zA-Z0-9_\-#+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang}">${PdfFormatter.escapeHtml(code.trim())}</code></pre>`;
    });

    // Code inline
    html = html.replace(/`([^`]+)`/g, (match, code) => {
      return `<code>${PdfFormatter.escapeHtml(code)}</code>`;
    });

    // Remplacer les syntaxes d'images markdown par une balise img propre
    html = html.replace(/!\[([\s\S]*?)\]\s*\(([^)]+)\)/g, (match, alt, src) => {
      return `<div class="image-card"><img src="${src.trim()}" alt="${PdfFormatter.escapeHtml(alt.trim())}" /><span class="image-caption">${PdfFormatter.escapeHtml(alt.trim())}</span></div>`;
    });

    // Si une image data:image a été scindée avec des retours à la ligne
    html = html.replace(/!\[([\s\S]*?)\][\s\r\n]+\(([^)]+)\)/g, (match, alt, src) => {
      return `<div class="image-card"><img src="${src.trim()}" alt="${PdfFormatter.escapeHtml(alt.trim())}" /><span class="image-caption">${PdfFormatter.escapeHtml(alt.trim())}</span></div>`;
    });

    // Liens classiques [texte](url) : les PDF embarqués (planches générées)
    // sont affichés en aperçu intégré plus bas — ici on n'en garde que le
    // titre, pour ne pas afficher deux fois la même planche.
    html = html.replace(/\[([^\]]+)\]\s*\(([^)]+)\)/g, (match, text, src) => {
      const u = src.trim();
      if (u.startsWith('data:application/pdf')) {
        return `<strong>${PdfFormatter.escapeHtml(text.trim())}</strong> <em>(aperçu ci-dessous)</em>`;
      }
      return `<a href="${u}">${PdfFormatter.escapeHtml(text.trim())}</a>`;
    });

    // Gras et italique
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Titres h1 à h6
    html = html.replace(/^###### (.*$)/gim, (m, t) => /^(you said|copilot said|vous avez dit)/i.test(t.trim()) ? '' : `<h6>${t.trim()}</h6>`);
    html = html.replace(/^##### (.*$)/gim, (m, t) => /^(you said|copilot said|vous avez dit)/i.test(t.trim()) ? '' : `<h5>${t.trim()}</h5>`);
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Sauts de paragraphes
    html = html.split('\n\n').map(p => {
      p = p.trim();
      if (!p) return '';
      if (
        p.startsWith('<pre>') ||
        p.startsWith('<h1>') || p.startsWith('<h2>') || p.startsWith('<h3>') ||
        p.startsWith('<h4>') || p.startsWith('<h5>') || p.startsWith('<h6>') ||
        p.startsWith('<ul>') || p.startsWith('<ol>') || p.startsWith('<div class="image-card">')
      ) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return html;
  }
}

window.PdfFormatter = PdfFormatter;
