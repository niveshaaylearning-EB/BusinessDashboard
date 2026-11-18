/**
 * Web Worker — runs Excel parsing and heavy data-engine computations
 * off the main thread so the UI stays responsive on large files.
 *
 * Protocol:
 *   Main → Worker:  { type: 'PARSE_EXCEL', buffer: ArrayBuffer, fileName: string }
 *   Worker → Main:  { type: 'PROGRESS', pct: number, message: string }
 *                   { type: 'DONE',     rows: array, fileName: string }
 *                   { type: 'ERROR',    message: string }
 */

import * as XLSX from 'xlsx';
import { readFirstSheetRows } from './xlsxStream.js';

const progress = (pct, message) => self.postMessage({ type: 'PROGRESS', pct, message });

// .xlsx files are zip archives, which start with "PK"
const isZip = (buffer) => {
  const b = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  return b[0] === 0x50 && b[1] === 0x4b;
};

self.onmessage = async ({ data }) => {
  if (data.type !== 'PARSE_EXCEL') return;

  try {
    progress(10, 'Reading file…');

    // .xlsx: stream the sheet row by row. XLSX.read silently returns ZERO rows
    // once a sheet's XML gets into the hundreds of MB (~225k rows did it), which
    // showed up as "File appears empty". The streaming reader produces the same
    // rows (verified value-for-value against XLSX.read on the real export).
    if (isZip(data.buffer)) {
      let rows = null;
      try {
        rows = await readFirstSheetRows(data.buffer, XLSX, progress);
      } catch {
        rows = null; // unusual .xlsx layout — fall through to XLSX.read
      }
      if (rows) {
        progress(95, `Loaded ${rows.length.toLocaleString()} rows…`);
        self.postMessage({ type: 'DONE', rows, fileName: data.fileName });
        return;
      }
    }

    // .xls / .csv (and the rare .xlsx the streaming reader can't handle)
    const wb = XLSX.read(data.buffer, { type: 'array', cellDates: true, dense: false });

    progress(40, 'Parsing sheets…');

    const sheetName = wb.SheetNames[0];
    const ws        = wb.Sheets[sheetName];

    progress(60, 'Converting rows…');

    // sheet_to_json with raw:false converts dates to strings automatically
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

    progress(90, `Loaded ${rows.length.toLocaleString()} rows…`);

    self.postMessage({ type: 'DONE', rows, fileName: data.fileName });
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err.message || 'Failed to parse Excel file' });
  }
};
