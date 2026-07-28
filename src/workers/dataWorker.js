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

self.onmessage = async ({ data }) => {
  if (data.type !== 'PARSE_EXCEL') return;

  try {
    self.postMessage({ type: 'PROGRESS', pct: 10, message: 'Reading file…' });

    const wb = XLSX.read(data.buffer, { type: 'array', cellDates: true, dense: false });

    self.postMessage({ type: 'PROGRESS', pct: 40, message: 'Parsing sheets…' });

    const sheetName = wb.SheetNames[0];
    const ws        = wb.Sheets[sheetName];

    self.postMessage({ type: 'PROGRESS', pct: 60, message: 'Converting rows…' });

    // sheet_to_json with raw:false converts dates to strings automatically
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

    self.postMessage({ type: 'PROGRESS', pct: 90, message: `Loaded ${rows.length.toLocaleString()} rows…` });

    self.postMessage({ type: 'DONE', rows, fileName: data.fileName });
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err.message || 'Failed to parse Excel file' });
  }
};
