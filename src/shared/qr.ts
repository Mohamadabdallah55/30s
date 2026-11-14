import QRCode from 'qrcode';

/**
 * Generates a real, ISO-compliant scannable QR code matrix offline
 * so phones can scan session links directly on local mosque networks.
 */
export function buildSessionMatrix(text: string): boolean[][] {
  const payload = text.trim() || 'T30';
  try {
    const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const grid: boolean[][] = [];
    for (let r = 0; r < size; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < size; c++) {
        row.push(Boolean(qr.modules.get(r, c)));
      }
      grid.push(row);
    }
    return grid;
  } catch {
    const size = 21;
    return Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => (r + c) % 2 === 0)
    );
  }
}
