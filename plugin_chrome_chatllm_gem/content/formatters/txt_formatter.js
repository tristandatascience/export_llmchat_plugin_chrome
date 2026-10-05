/**
 * TxtFormatter - Générateur de fichier texte brut (.txt)
 */
class TxtFormatter {
  static format(messages, metadata = {}) {
    const { title = 'Conversation', platform = 'ChatLLM', exportDate = new Date().toLocaleString() } = metadata;
    const divider = '='.repeat(80);
    const subDivider = '-'.repeat(80);

    const lines = [];
    lines.push(divider);
    lines.push(`CONVERSATION : ${title}`);
    lines.push(`PLATEFORME   : ${platform}`);
    lines.push(`DATE EXPORT  : ${exportDate}`);
    lines.push(`MESSAGES     : ${messages.length}`);
    lines.push(divider);
    lines.push('');

    messages.forEach((msg, idx) => {
      const author = msg.role === 'user' ? 'UTILISATEUR' : (msg.authorName || 'ASSISTANT').toUpperCase();
      lines.push(subDivider);
      lines.push(`[#${idx + 1}] ${author} - ${msg.timestamp || ''}`);
      lines.push(subDivider);
      lines.push('');
      lines.push(msg.text || '(Aucun contenu textuel)');
      lines.push('');

      if (msg.images && msg.images.length > 0) {
        lines.push(`[Images (${msg.images.length}) :]`);
        msg.images.forEach((img, imgIdx) => {
          const alt = img.alt || `Image ${imgIdx + 1}`;
          lines.push(`  * [Image ${imgIdx + 1}] ${alt}`);
        });
        lines.push('');
      }
      lines.push('');
    });

    lines.push(divider);
    lines.push('FIN DU FICHIER');
    lines.push(divider);

    return lines.join('\n');
  }

  static download(messages, metadata = {}) {
    const text = TxtFormatter.format(messages, metadata);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const dateStr = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const filename = `${sanitizeFilename(metadata.title || 'conversation')}_${dateStr}.txt`;
    downloadBlob(blob, filename);
  }
}

function sanitizeFilename(name) {
  return (name || 'conversation')
    .toLowerCase()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 50);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}

window.TxtFormatter = TxtFormatter;
window.sanitizeFilename = sanitizeFilename;
window.downloadBlob = downloadBlob;
