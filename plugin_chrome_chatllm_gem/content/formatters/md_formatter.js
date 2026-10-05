/**
 * MdFormatter - Générateur de Markdown (.md) et d'archive ZIP Markdown + Images
 */
class MdFormatter {
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
   * Génère le Markdown avec images intégrées en Data URL (Base64)
   */
  static formatInline(messages, metadata = {}) {
    const { title = 'Conversation', platform = 'ChatLLM', exportDate = new Date().toLocaleString() } = metadata;
    const lines = [];

    lines.push(`# Conversation : ${title}\n`);
    lines.push(`> **Plateforme :** ${platform}  `);
    lines.push(`> **Date d'export :** ${exportDate}  `);
    lines.push(`> **Nombre de messages :** ${messages.length}\n`);
    lines.push('---\n');

    messages.forEach((msg, idx) => {
      const isUser = msg.role === 'user';
      const author = isUser ? '👤 Utilisateur' : `🤖 ${msg.authorName || 'Assistant'}`;
      
      lines.push(`### ${author}`);
      if (msg.timestamp) {
        lines.push(`*${msg.timestamp}*\n`);
      } else {
        lines.push('');
      }

      // Nettoyage des en-têtes d'accessibilité résiduels ("You said:", "Copilot said:", etc.)
      let bodyText = (msg.markdown || msg.text || '').trim();
      bodyText = bodyText.replace(/^(#{1,6}\s*(You said:|Copilot said:|Vous avez dit :).*?(\n|$))/gim, '').trim();

      // Dédupliquer les images du message
      const uniqueImages = [];
      const seenSources = new Set();
      if (msg.images && msg.images.length > 0) {
        msg.images.forEach(img => {
          const key = MdFormatter.getCanonicalUrl(img.src);
          if (key && !seenSources.has(key)) {
            seenSources.add(key);
            uniqueImages.push(img);
          }
        });
      }

      // Remplacement en ligne dans le corps markdown pour éviter d'avoir l'image en double
      const placedImages = new Set();
      if (uniqueImages.length > 0 && bodyText) {
        uniqueImages.forEach(img => {
          const targetSrc = img.dataUrl || img.src;
          if (img.src && bodyText.includes(img.src) && !img.src.startsWith('data:')) {
            bodyText = bodyText.split(img.src).join(targetSrc);
            placedImages.add(img);
          }
        });
      }

      if (bodyText) {
        lines.push(bodyText);
      }

      // Ajouter uniquement les images qui ne sont pas déjà affichées dans le corps
      const unplacedImages = uniqueImages.filter(img => !placedImages.has(img));
      if (unplacedImages.length > 0) {
        lines.push('\n#### Images jointes :\n');
        unplacedImages.forEach((img, imgIdx) => {
          const alt = img.alt || `Image ${imgIdx + 1}`;
          const src = img.dataUrl || img.src;
          lines.push(`![${alt}](${src})\n`);
        });
      }

      lines.push('\n---\n');
    });

    return lines.join('\n');
  }

  /**
   * Génère le Markdown avec chemins relatifs vers un dossier images/
   */
  static formatForZip(messages, metadata = {}) {
    const { title = 'Conversation', platform = 'ChatLLM', exportDate = new Date().toLocaleString() } = metadata;
    const lines = [];

    lines.push(`# Conversation : ${title}\n`);
    lines.push(`> **Plateforme :** ${platform}  `);
    lines.push(`> **Date d'export :** ${exportDate}  `);
    lines.push(`> **Nombre de messages :** ${messages.length}\n`);
    lines.push('---\n');

    let globalImgCounter = 1;

    messages.forEach((msg) => {
      const isUser = msg.role === 'user';
      const author = isUser ? '👤 Utilisateur' : `🤖 ${msg.authorName || 'Assistant'}`;
      
      lines.push(`### ${author}`);
      if (msg.timestamp) {
        lines.push(`*${msg.timestamp}*\n`);
      } else {
        lines.push('');
      }

      let bodyText = (msg.markdown || msg.text || '').trim();
      bodyText = bodyText.replace(/^(#{1,6}\s*(You said:|Copilot said:|Vous avez dit :).*?(\n|$))/gim, '').trim();

      // Dédupliquer les images du message
      const uniqueImages = [];
      const seenSources = new Set();
      if (msg.images && msg.images.length > 0) {
        msg.images.forEach(img => {
          const key = MdFormatter.getCanonicalUrl(img.src);
          if (key && !seenSources.has(key)) {
            seenSources.add(key);
            uniqueImages.push(img);
          }
        });
      }

      const placedImages = new Set();
      uniqueImages.forEach((img) => {
        const ext = img.extension || 'png';
        const filename = `images/img_${String(globalImgCounter).padStart(3, '0')}.${ext}`;
        img.zipFilename = filename;
        globalImgCounter++;

        if (img.src && bodyText.includes(img.src) && !img.src.startsWith('data:')) {
          bodyText = bodyText.split(img.src).join(filename);
          placedImages.add(img);
        }
      });

      if (bodyText) {
        lines.push(bodyText);
      }

      // Ajouter uniquement les images qui ne sont pas déjà incluses dans bodyText
      const unplacedImages = uniqueImages.filter(img => !placedImages.has(img));
      if (unplacedImages.length > 0) {
        lines.push('\n#### Images jointes :\n');
        unplacedImages.forEach((img) => {
          const alt = img.alt || `Image`;
          lines.push(`![${alt}](${img.zipFilename})\n`);
        });
      }

      lines.push('\n---\n');
    });

    return lines.join('\n');
  }

  /**
   * Télécharge un unique fichier .md avec images Base64 intégrées
   */
  static downloadSingleFile(messages, metadata = {}) {
    const md = MdFormatter.formatInline(messages, metadata);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const dateStr = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const filename = `${sanitizeFilename(metadata.title || 'conversation')}_${dateStr}.md`;
    downloadBlob(blob, filename);
  }

  /**
   * Télécharge une archive ZIP contenant le .md et le dossier images/
   */
  static async downloadZip(messages, metadata = {}) {
    const zip = new window.ZipArchive();
    const mdContent = MdFormatter.formatForZip(messages, metadata);
    await zip.addFile('conversation.md', mdContent);

    // Ajouter chaque image dans le zip (sans doublon de nom de fichier)
    const addedZipFiles = new Set();
    for (const msg of messages) {
      if (msg.images) {
        for (const img of msg.images) {
          if (img.zipFilename && img.dataUrl && !addedZipFiles.has(img.zipFilename)) {
            addedZipFiles.add(img.zipFilename);
            const rawBytes = MdFormatter.dataUrlToUint8Array(img.dataUrl);
            await zip.addFile(img.zipFilename, rawBytes);
          }
        }
      }
    }

    const zipBlob = zip.generateBlob();
    const dateStr = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const filename = `${sanitizeFilename(metadata.title || 'conversation')}_${dateStr}.zip`;
    downloadBlob(zipBlob, filename);
  }

  static dataUrlToUint8Array(dataUrl) {
    const base64Index = dataUrl.indexOf(';base64,');
    if (base64Index === -1) {
      return new TextEncoder().encode(dataUrl);
    }
    const base64 = dataUrl.substring(base64Index + 8);
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

window.MdFormatter = MdFormatter;
