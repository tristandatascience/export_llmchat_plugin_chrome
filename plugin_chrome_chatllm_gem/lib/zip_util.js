/**
 * Pure JavaScript ZIP Archive Generator (PKZip specification)
 * Ne nécessite aucune dépendance externe.
 * Compatible avec l'explorateur Windows, macOS, Linux et les outils d'archivage.
 */
class ZipArchive {
  constructor() {
    this.files = [];
  }

  /**
   * Ajoute un fichier à l'archive.
   * @param {string} filename - Chemin relatif dans le zip (ex: 'images/img1.png')
   * @param {Uint8Array|ArrayBuffer|string|Blob} data - Données du fichier
   */
  async addFile(filename, data) {
    let uint8Data;
    if (typeof data === 'string') {
      uint8Data = new TextEncoder().encode(data);
    } else if (data instanceof Blob) {
      const buffer = await data.arrayBuffer();
      uint8Data = new Uint8Array(buffer);
    } else if (data instanceof ArrayBuffer) {
      uint8Data = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      uint8Data = data;
    } else {
      throw new Error('Type de données non supporté pour ZipArchive');
    }

    this.files.push({
      name: filename.replace(/\\/g, '/'),
      data: uint8Data,
      date: new Date()
    });
  }

  // Calculateur de table CRC-32
  static getCrcTable() {
    if (ZipArchive.crcTable) return ZipArchive.crcTable;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    ZipArchive.crcTable = table;
    return table;
  }

  static crc32(buf) {
    const table = ZipArchive.getCrcTable();
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  static formatDosTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);
    return (hours << 11) | (minutes << 5) | seconds;
  }

  static formatDosDate(date) {
    const year = date.getFullYear() - 1980;
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return (year << 9) | (month << 5) | day;
  }

  /**
   * Génère le Blob de l'archive ZIP
   * @returns {Blob}
   */
  generateBlob() {
    const fileRecords = [];
    let localOffset = 0;
    const utf8Encoder = new TextEncoder();

    // 1. Génération des en-têtes locaux et données
    const localChunks = [];
    for (const file of this.files) {
      const nameBytes = utf8Encoder.encode(file.name);
      const crc = ZipArchive.crc32(file.data);
      const size = file.data.length;
      const dosTime = ZipArchive.formatDosTime(file.date);
      const dosDate = ZipArchive.formatDosDate(file.date);

      // Local file header (30 octets)
      const header = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(header.buffer);

      view.setUint32(0, 0x04034b50, true); // Signature
      view.setUint16(4, 20, true);         // Version needed (2.0)
      view.setUint16(6, 0x0800, true);     // General purpose flag (bit 11 = UTF-8)
      view.setUint16(8, 0, true);          // Compression method (0 = Store)
      view.setUint16(10, dosTime, true);
      view.setUint16(12, dosDate, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, size, true);       // Compressed size
      view.setUint32(22, size, true);       // Uncompressed size
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);          // Extra field length
      header.set(nameBytes, 30);

      localChunks.push(header);
      localChunks.push(file.data);

      fileRecords.push({
        nameBytes,
        crc,
        size,
        dosTime,
        dosDate,
        offset: localOffset
      });

      localOffset += header.length + size;
    }

    // 2. Génération du Répertoire Central (Central Directory)
    const centralChunks = [];
    let centralDirSize = 0;

    for (const record of fileRecords) {
      // Central directory header (46 octets)
      const cdHeader = new Uint8Array(46 + record.nameBytes.length);
      const cdView = new DataView(cdHeader.buffer);

      cdView.setUint32(0, 0x02014b50, true); // Signature
      cdView.setUint16(4, 20, true);         // Version made by
      cdView.setUint16(6, 20, true);         // Version needed
      cdView.setUint16(8, 0x0800, true);     // Flags (UTF-8)
      cdView.setUint16(10, 0, true);         // Compression method (0)
      cdView.setUint16(12, record.dosTime, true);
      cdView.setUint16(14, record.dosDate, true);
      cdView.setUint32(16, record.crc, true);
      cdView.setUint32(20, record.size, true); // Compressed size
      cdView.setUint32(24, record.size, true); // Uncompressed size
      cdView.setUint16(28, record.nameBytes.length, true);
      cdView.setUint16(30, 0, true);         // Extra field length
      cdView.setUint16(32, 0, true);         // Comment length
      cdView.setUint16(34, 0, true);         // Disk number start
      cdView.setUint16(36, 0, true);         // Internal file attributes
      cdView.setUint32(38, 0, true);         // External file attributes
      cdView.setUint32(42, record.offset, true); // Relative offset of local header
      cdHeader.set(record.nameBytes, 46);

      centralChunks.push(cdHeader);
      centralDirSize += cdHeader.length;
    }

    // 3. Fin du répertoire central (End of Central Directory Record - 22 octets)
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);

    eocdView.setUint32(0, 0x06054b50, true); // Signature
    eocdView.setUint16(4, 0, true);          // Disk number
    eocdView.setUint16(6, 0, true);          // Disk with central dir
    eocdView.setUint16(8, this.files.length, true);  // Entries on disk
    eocdView.setUint16(10, this.files.length, true); // Total entries
    eocdView.setUint32(12, centralDirSize, true);    // Size of central dir
    eocdView.setUint32(16, localOffset, true);       // Offset of central dir
    eocdView.setUint16(20, 0, true);                 // Comment length

    const allParts = [...localChunks, ...centralChunks, eocd];
    return new Blob(allParts, { type: 'application/zip' });
  }
}

// Exposer globalement pour le content script
window.ZipArchive = ZipArchive;
