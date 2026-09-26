/**
 * AI Chat Export — générateur PDF minimal (sans dépendance).
 *
 * Produit un PDF 1.4 valide avec les polices standard (Helvetica,
 * Helvetica-Bold, Helvetica-Oblique, Courier) en encodage WinAnsi :
 * texte sélectionnable, fichier léger, pagination automatique.
 *
 * Limite connue : les caractères hors Latin/Western European (CJK,
 * cyrillique, emojis…) sont retirés ou translittérés — l'export Markdown
 * reste l'export de haute fidélité.
 */

(() => {
  const PAGE = { w: 595.28, h: 841.89 }; // A4 en points
  const MARGIN = { top: 64, bottom: 64, left: 56, right: 56 };
  const CONTENT_W = PAGE.w - MARGIN.left - MARGIN.right;

  // Largeurs de glyphe (/1000) pour Helvetica et Helvetica-Bold, codes 32..126
  // (données AFM publiques). Les autres caractères utilisent une largeur
  // moyenne de 556, suffisante pour la coupe de ligne.
  const HELV = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
  ];
  const HELV_BOLD = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
  ];

  // ------------------------------------------------------------------
  // Encodage WinAnsi (cp1252) : translittération des caractères Unicode
  // ------------------------------------------------------------------
  const CP1252 = {
    '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85,
    '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8A,
    '\u2039': 0x8B, '\u0152': 0x8C, '\u017D': 0x8E, '\u2018': 0x91, '\u2019': 0x92,
    '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
    '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B, '\u0153': 0x9C,
    '\u017E': 0x9E, '\u0178': 0x9F
  };
  const ASCII_MAP = {
    '\u2192': '->', '\u2190': '<-', '\u2191': '^', '\u2193': 'v',
    '\u2264': '<=', '\u2265': '>=', '\u2260': '!=', '\u2248': '~=',
    '\u00A0': ' ', '\u200B': '', '\uFEFF': '', '\u00AD': '',
    '\u2212': '-', '\u2011': '-', '\u202F': ' ', '\u2009': ' ', '\u2007': ' '
  };

  function sanitizeLine(s) {
    let out = '';
    for (const ch of String(s)) {
      const code = ch.codePointAt(0);
      if (code === 9) { out += ' '; continue; }
      if (code < 32) { continue; }
      if (code <= 0xFF) { out += ch; continue; }
      if (CP1252[ch] !== undefined) { out += String.fromCharCode(CP1252[ch]); continue; }
      if (ASCII_MAP[ch] !== undefined) { out += ASCII_MAP[ch]; continue; }
      // Emojis, flèches, symboles divers : retirés.
      if (code >= 0x1F000 || (code >= 0x2190 && code <= 0x2BFF)) continue;
      if (code >= 0xFE00 && code <= 0xFE0F) continue;
      out += '?';
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Mesure de texte et coupe de ligne
  // ------------------------------------------------------------------
  function textWidth(text, font, size) {
    if (font === 'F4') return text.length * 600 * size / 1000; // Courier
    const table = font === 'F2' ? HELV_BOLD : HELV;
    let w = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      w += (c >= 32 && c <= 126) ? table[c - 32] : 556;
    }
    return w * size / 1000;
  }

  function wrap(text, font, size, maxW) {
    const out = [];
    let cur = '';
    for (const word of String(text).split(/[ \t]+/)) {
      if (!word) continue;
      const test = cur ? cur + ' ' + word : word;
      if (textWidth(test, font, size) <= maxW) { cur = test; continue; }
      if (cur) { out.push(cur); cur = ''; }
      if (textWidth(word, font, size) <= maxW) { cur = word; continue; }
      // Mot plus long que la ligne (URL…) : coupe dure.
      let piece = '';
      for (const ch of word) {
        if (textWidth(piece + ch, font, size) > maxW) { out.push(piece); piece = ch; }
        else { piece += ch; }
      }
      cur = piece;
    }
    if (cur) out.push(cur);
    return out.length > 0 ? out : [''];
  }

  function clip(text, font, size, maxW) {
    if (textWidth(text, font, size) <= maxW) return text;
    let out = '';
    for (const ch of text) {
      if (textWidth(out + ch + '…', font, size) > maxW) break;
      out += ch;
    }
    return out + '…';
  }

  // ------------------------------------------------------------------
  // Nettoyage du Markdown en ligne (le PDF est une version lisible)
  // ------------------------------------------------------------------
  function inlineClean(t) {
    let s = String(t);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g, (m, alt, url) =>
      alt ? `${alt} (image : ${url})` : `(image : ${url})`);
    s = s.replace(/\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g, (m, txt, url) => {
      if (url && txt && txt !== url) return `${txt} (${url})`;
      return txt || url || '';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
    s = s.replace(/\*([^*]+)\*/g, '$1');
    s = s.replace(/`([^`]+)`/g, '$1');
    s = s.replace(/~~([^~]+)~~/g, '$1');
    return s;
  }

  // ------------------------------------------------------------------
  // Découpage du texte d'un message en blocs (paragraphe, code, liste…)
  // ------------------------------------------------------------------
  function parseBlocks(text) {
    const lines = String(text).split('\n');
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        const lang = line.replace(/^\s*```/, '').trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { codeLines.push(lines[i]); i++; }
        i++; // clôture du bloc
        blocks.push({ type: 'code', lang, lines: codeLines });
        continue;
      }
      if (/^\s*$/.test(line)) { i++; continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }
      if (/^#{1,6}\s+/.test(line)) {
        const level = line.match(/^#+/)[0].length;
        blocks.push({ type: 'heading', level, text: line.replace(/^#+\s+/, '') });
        i++;
        continue;
      }
      if (/^\s*>\s?/.test(line)) {
        const quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        blocks.push({ type: 'quote', lines: quote });
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          items.push({
            marker: lines[i].match(/^\s*([-*+]|\d+[.)])/)[0].trim(),
            text: lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '')
          });
          i++;
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) &&
                 !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && !/^\s*```/.test(lines[i])) {
            items[items.length - 1].text += ' ' + lines[i].trim();
            i++;
          }
        }
        blocks.push({ type: 'list', items });
        continue;
      }
      // Image seule sur sa ligne : rendue embarquée si disponible
      if (/^!\[[^\]]*\]\([^)\s]+\)\s*$/.test(line.trim())) {
        blocks.push({ type: 'image', ref: line.trim() });
        i++;
        continue;
      }
      // Paragraphe : lignes consécutives jusqu'à une ligne vide ou un bloc
      const para = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*```/.test(lines[i]) &&
             !/^#{1,6}\s+/.test(lines[i]) && !/^\s*>\s?/.test(lines[i]) &&
             !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && !/^!\[[^\]]*\]\([^)\s]+\)\s*$/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'p', text: para.join(' ') });
    }
    return blocks;
  }

  // ------------------------------------------------------------------
  // Document PDF
  // ------------------------------------------------------------------
  const n2 = (v) => (Math.round(v * 100) / 100).toString();
  const n3 = (c) => c.map((v) => (Math.round(v * 1000) / 1000).toString()).join(' ');
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  class Pdf {
    constructor(images) {
      this.pages = [];
      this.ops = null;
      this.y = 0;
      this.images = images || new Map(); // filename -> {bytes, width, height, ref}
      this.newPage();
    }
    newPage() {
      this.ops = [];
      this.pages.push(this.ops);
      this.y = PAGE.h - MARGIN.top;
    }
    ensure(height) {
      if (this.y - height < MARGIN.bottom) this.newPage();
    }
    text(x, y, str, opts) {
      const o = opts || {};
      const font = o.font || 'F1';
      const size = o.size || 10;
      const color = o.color || [0.13, 0.16, 0.2];
      this.ops.push(
        `${n3(color)} rg BT /${font} ${n2(size)} Tf 1 0 0 1 ${n2(x)} ${n2(y)} Tm (${esc(str)}) Tj ET`
      );
    }
    image(x, y, w, h, ref) {
      // Dessine l'image XObject dans un rectangle (w × h) au point (x, y).
      this.ops.push(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(y)} cm ${ref} Do Q`);
    }
    rect(x, y, w, h, color) {
      this.ops.push(`${n3(color)} rg ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f`);
    }
    rule(x, y, w, color) {
      this.rect(x, y, w, 0.7, color || [0.85, 0.87, 0.9]);
    }
  }

  // ------------------------------------------------------------------
  // Rendu d'un message
  // ------------------------------------------------------------------
  function renderMessage(pdf, message, meta) {
    const isUser = message.role === 'user';
    const color = isUser ? [0.15, 0.39, 0.92] : [0.02, 0.58, 0.68];
    const name = isUser ? (meta.youLabel || 'You') : meta.assistantName;

    pdf.ensure(60);
    pdf.rect(MARGIN.left, pdf.y - 10, 3.5, 14, color); // repère vertical coloré
    pdf.text(MARGIN.left + 11, pdf.y, name, { font: 'F2', size: 11, color });
    pdf.y -= 7;
    pdf.rule(MARGIN.left, pdf.y, CONTENT_W);
    pdf.y -= 16;

    for (const block of parseBlocks(message.text)) {
      renderBlock(pdf, block);
      pdf.y -= 4;
    }
    pdf.y -= 12;
  }

  function renderBlock(pdf, block) {
    switch (block.type) {
      case 'heading': {
        const size = block.level <= 2 ? 11.5 : 10.5;
        const text = sanitizeLine(inlineClean(block.text));
        const lines = wrap(text, 'F2', size, CONTENT_W);
        for (const line of lines) {
          pdf.ensure(size + 4);
          pdf.y -= size + 2;
          pdf.text(MARGIN.left, pdf.y, line, { font: 'F2', size, color: [0.08, 0.1, 0.15] });
        }
        pdf.y -= 4;
        break;
      }
      case 'p': {
        const text = sanitizeLine(inlineClean(block.text));
        const lines = wrap(text, 'F1', 10, CONTENT_W);
        for (const line of lines) {
          pdf.ensure(15);
          pdf.y -= 14;
          pdf.text(MARGIN.left, pdf.y, line, { font: 'F1', size: 10 });
        }
        break;
      }
      case 'quote': {
        const indent = 14;
        const width = CONTENT_W - indent;
        const allLines = [];
        for (const ql of block.lines) {
          const text = sanitizeLine(inlineClean(ql));
          for (const line of wrap(text, 'F3', 9.5, width - 4)) allLines.push(line);
        }
        const height = allLines.length * 13 + 8;
        pdf.ensure(height);
        const top = pdf.y;
        pdf.rect(MARGIN.left + indent - 8, top - height + 10, 2, height - 8, [0.78, 0.82, 0.85]);
        for (const line of allLines) {
          pdf.y -= 13;
          pdf.text(MARGIN.left + indent, pdf.y, line, { font: 'F3', size: 9.5, color: [0.35, 0.39, 0.44] });
        }
        pdf.y -= 2;
        break;
      }
      case 'list': {
        const indent = 16;
        const width = CONTENT_W - indent - 14;
        for (const item of block.items) {
          const marker = /^\d/.test(item.marker) ? item.marker + ' ' : '\u2022  ';
          const text = sanitizeLine(inlineClean(item.text));
          const lines = wrap(text, 'F1', 10, width);
          for (let k = 0; k < lines.length; k++) {
            pdf.ensure(15);
            pdf.y -= 14;
            if (k === 0) {
              pdf.text(MARGIN.left + indent, pdf.y, marker, { font: 'F1', size: 10 });
            }
            pdf.text(MARGIN.left + indent + 14, pdf.y, lines[k], { font: 'F1', size: 10 });
          }
          pdf.y -= 1;
        }
        break;
      }
      case 'code': {
        const pad = 8;
        const size = 8.5;
        const leading = 11;
        const width = CONTENT_W - pad * 2;
        const codeLines = [];
        for (const raw of block.lines) {
          const line = sanitizeLine(raw.replace(/\t/g, '    '));
          for (const piece of wrap(line, 'F4', size, width)) codeLines.push(piece);
        }
        if (codeLines.length === 0) codeLines.push('');
        const height = codeLines.length * leading + pad * 2 - 4;
        pdf.ensure(height + 8);
        const top = pdf.y;
        pdf.rect(MARGIN.left, top - height, CONTENT_W, height, [0.95, 0.96, 0.98]);
        pdf.y -= pad;
        for (const line of codeLines) {
          pdf.y -= leading;
          pdf.text(MARGIN.left + pad, pdf.y, line, { font: 'F4', size, color: [0.13, 0.18, 0.25] });
        }
        pdf.y -= pad;
        break;
      }
      case 'image': {
        const m = block.ref.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
        const alt = m ? m[1] : '';
        const file = m ? m[2] : '';
        const img = pdf.images.get(file);
        if (img) {
          const maxW = CONTENT_W;
          const maxH = 380;
          const scale = Math.min(maxW / img.width, maxH / img.height);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          pdf.ensure(h + 30);
          const x = MARGIN.left + (CONTENT_W - w) / 2;
          pdf.y -= h;
          pdf.image(x, pdf.y, w, h, img.ref);
          pdf.y -= 13;
          pdf.text(MARGIN.left, pdf.y, sanitizeLine(alt || file), { size: 8, color: [0.45, 0.5, 0.55] });
          pdf.y -= 6;
        } else {
          // Image non embarquable : référence claire en toutes lettres
          pdf.ensure(16);
          pdf.y -= 14;
          pdf.text(MARGIN.left, pdf.y, sanitizeLine(`[Image : ${file}]`),
            { size: 9, color: [0.35, 0.39, 0.44] });
        }
        break;
      }
      case 'hr': {
        pdf.ensure(14);
        pdf.y -= 10;
        pdf.rule(MARGIN.left, pdf.y, CONTENT_W);
        break;
      }
    }
  }

  // ------------------------------------------------------------------
  // Assemblage du fichier PDF
  // ------------------------------------------------------------------
  function assemble(pagesOps, imageList) {
    const FONTS = [
      ['F1', 'Helvetica'],
      ['F2', 'Helvetica-Bold'],
      ['F3', 'Helvetica-Oblique'],
      ['F4', 'Courier']
    ];
    let nextId = 1;
    const catalogId = nextId++;
    const pagesId = nextId++;
    const fontIds = {};
    for (const [name] of FONTS) fontIds[name] = nextId++;

    // Images JPEG embarquées (XObject /DCTDecode)
    const imageIds = imageList.map(() => nextId++);

    const pageIds = [];
    const contentIds = [];
    for (let i = 0; i < pagesOps.length; i++) {
      pageIds.push(nextId++);
      contentIds.push(nextId++);
    }

    let out = '%PDF-1.4\n';
    const offsets = {};
    const pushObj = (id, body) => {
      offsets[id] = out.length;
      out += `${id} 0 obj\n${body}\nendobj\n`;
    };
    const pushRawObj = (id, prefix, bytes) => {
      // Objet avec flux binaire (bytes = caractères latin-1, 1 octet chacun)
      offsets[id] = out.length;
      out += `${id} 0 obj\n${prefix}${toLatin1(bytes)}\nendstream\nendobj\n`;
    };

    pushObj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
    pushObj(pagesId, `<< /Type /Pages /Kids [${kids}] /Count ${pageIds.length} >>`);
    for (let i = 0; i < FONTS.length; i++) {
      pushObj(fontIds[FONTS[i][0]],
        `<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[i][1]} /Encoding /WinAnsiEncoding >>`);
    }
    imageList.forEach((img, idx) => {
      pushRawObj(imageIds[idx],
        `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`,
        img.bytes);
    });

    const fontRes = FONTS.map(([name]) => `/${name} ${fontIds[name]} 0 R`).join(' ');
    const xobjRes = imageIds.length > 0
      ? ' /XObject << ' + imageIds.map((id, idx) => `/Im${idx + 1} ${id} 0 R`).join(' ') + ' >>'
      : '';
    for (let i = 0; i < pagesOps.length; i++) {
      pushObj(pageIds[i],
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n2(PAGE.w)} ${n2(PAGE.h)}] ` +
        `/Resources << /Font << ${fontRes} >>${xobjRes} >> /Contents ${contentIds[i]} 0 R >>`);
      const stream = pagesOps[i].join('\n');
      pushObj(contentIds[i], `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    }

    const count = nextId - 1;
    const xrefOffset = out.length;
    let xref = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= count; id++) {
      xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }
    out += xref;
    out += `trailer\n<< /Size ${count + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
    return bytes;
  }

  function toLatin1(bytes) {
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return s;
  }

  // ------------------------------------------------------------------
  // API : rend une conversation complète en PDF (Uint8Array)
  // ------------------------------------------------------------------
  function conversation(messages, meta, includeHeader, images) {
    // Registre des images embarquées : filename -> {bytes, width, height, ref}
    const imageMap = new Map();
    const imageList = [];
    if (Array.isArray(images)) {
      images.forEach((img, idx) => {
        if (!img || !img.bytes || !img.bytes.length || !img.width || !img.height) return;
        const entry = {
          bytes: img.bytes,
          width: img.width,
          height: img.height,
          ref: `/Im${imageList.length + 1}`
        };
        imageMap.set(img.filename, entry);
        imageList.push(entry);
      });
    }

    const pdf = new Pdf(imageMap);

    if (includeHeader) {
      const title = sanitizeLine(meta.title || `Conversation ${meta.platform}`);
      pdf.text(MARGIN.left, pdf.y, clip(title, 'F2', 15, CONTENT_W), { font: 'F2', size: 15, color: [0.08, 0.1, 0.15] });
      pdf.y -= 17;
      pdf.text(MARGIN.left, pdf.y,
        sanitizeLine(meta.exportLine || `Exported on ${meta.date} from ${meta.platform}`),
        { size: 8.5, color: [0.45, 0.5, 0.55] });
      pdf.y -= 12;
      pdf.text(MARGIN.left, pdf.y, clip(sanitizeLine(meta.url || ''), 'F1', 8, CONTENT_W),
        { size: 8, color: [0.55, 0.58, 0.62] });
      pdf.y -= 12;
      pdf.rule(MARGIN.left, pdf.y, CONTENT_W);
      pdf.y -= 26;
    }

    for (const message of messages || []) {
      if (message && message.text) renderMessage(pdf, message, meta);
    }

    // Numéros de page
    const total = pdf.pages.length;
    pdf.pages.forEach((ops, idx) => {
      const label = `${idx + 1} / ${total}`;
      const w = textWidth(label, 'F1', 8);
      ops.push(
        `0.55 0.58 0.62 rg BT /F1 8 Tf 1 0 0 1 ${n2(PAGE.w / 2 - w / 2)} 30 Tm (${label}) Tj ET`
      );
    });

    return assemble(pdf.pages, imageList);
  }

  globalThis.__AIChatExportPdf = { conversation };
})();
