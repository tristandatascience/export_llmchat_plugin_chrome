/**
 * Script de la page d'impression PDF
 * Fonctionne dans le contexte de l'extension Chrome (libre de toute CSP externe).
 */
document.addEventListener('DOMContentLoaded', async () => {
  const printBtn = document.getElementById('btn-print');
  const saveHtmlBtn = document.getElementById('btn-save-html');
  const docTitleEl = document.getElementById('doc-title');
  const metaPlatformEl = document.getElementById('meta-platform');
  const metaDateEl = document.getElementById('meta-date');
  const metaCountEl = document.getElementById('meta-count');
  const chatFlowEl = document.getElementById('chat-flow');

  printBtn.addEventListener('click', () => {
    window.print();
  });

  saveHtmlBtn.addEventListener('click', () => {
    const fullHtml = document.documentElement.outerHTML;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    a.download = `${(docTitleEl.textContent || 'conversation').replace(/[\\/:*?"<>|\s]/g, '_')}_${dateStr}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  });

  try {
    const data = await chrome.storage.local.get(['pendingExportData']);
    const exportData = data.pendingExportData;

    if (!exportData || !exportData.messages) {
      chatFlowEl.innerHTML = '<p style="padding: 20px; color: #ef4444;">Aucune conversation en attente d\'impression.</p>';
      return;
    }

    const { messages, metadata = {} } = exportData;
    const title = metadata.title || 'Conversation';
    const platform = metadata.platform || 'ChatLLM';
    const exportDate = metadata.exportDate || new Date().toLocaleString();

    document.title = `${title} - Export PDF`;
    docTitleEl.textContent = title;
    metaPlatformEl.textContent = platform;
    metaDateEl.textContent = exportDate;
    metaCountEl.textContent = messages.length;

    // Rendu des messages
    chatFlowEl.innerHTML = messages.map((msg, idx) => {
      const isUser = msg.role === 'user';
      const roleClass = isUser ? 'user-bubble' : 'ai-bubble';
      const badgeClass = isUser ? 'badge-user' : 'badge-ai';
      const author = isUser ? '👤 Utilisateur' : `🤖 ${msg.authorName || 'Assistant'}`;

      let bodyHtml = renderMarkdownToHtml(msg.markdown || msg.text || '');

      if (msg.images && msg.images.length > 0) {
        msg.images.forEach(img => {
          if (img.src && img.dataUrl && bodyHtml.includes(img.src)) {
            bodyHtml = bodyHtml.split(img.src).join(img.dataUrl);
          }
        });
      }

      // Dédupliquer les images du message via URL canonique
      const uniqueImages = [];
      const seenSources = new Set();
      if (msg.images && msg.images.length > 0) {
        msg.images.forEach(img => {
          const key = getCanonicalUrl(img.src);
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
                <img src="${img.dataUrl || img.src}" alt="${escapeHtml(img.alt || 'image')}" />
                ${img.alt ? `<span class="image-caption">${escapeHtml(img.alt)}</span>` : ''}
              </div>
            `).join('')}
          </div>
        `;
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
        </div>
      `;
    }).join('\n');

    // Attendre que les images soient décodées avant de déclencher l'impression
    const images = Array.from(chatFlowEl.querySelectorAll('img'));
    await Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));

    // Déclenchement automatique de la fenêtre d'impression
    setTimeout(() => {
      window.print();
    }, 500);

  } catch (err) {
    console.error('Erreur chargement export:', err);
    chatFlowEl.innerHTML = `<p style="padding: 20px; color: #ef4444;">Erreur : ${err.message}</p>`;
  }
});

function getCanonicalUrl(src) {
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

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarkdownToHtml(md) {
  if (!md) return '';
  let html = md;

  // Supprimer les labels d'accessibilité parasites
  html = html.replace(/^(#{1,6}\s*(You said:|Copilot said:|Vous avez dit :).*?(\n|$))/gim, '');
  html = html.replace(/^(\s*(You said:|Copilot said:|Vous avez dit :)[:\s]*(\n|$))/gim, '');

  // Blocs de code
  html = html.replace(/```([a-zA-Z0-9_\-#+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });

  // Code inline
  html = html.replace(/`([^`]+)`/g, (match, code) => {
    return `<code>${escapeHtml(code)}</code>`;
  });

  // Remplacer les images markdown par un bloc image propre si ce n'est pas déjà dans msg.images
  html = html.replace(/!\[([\s\S]*?)\]\s*\(([^)]+)\)/g, (match, alt, src) => {
    return `<div class="image-card"><img src="${src.trim()}" alt="${escapeHtml(alt.trim())}" /><span class="image-caption">${escapeHtml(alt.trim())}</span></div>`;
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
