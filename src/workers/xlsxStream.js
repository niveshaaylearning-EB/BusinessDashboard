/**
 * Streaming reader for the first sheet of an .xlsx file.
 *
 * Why this exists: SheetJS (xlsx 0.18.5) decodes a whole worksheet into one
 * string and finds the rows with a single regex over it. Once the sheet's XML
 * gets into the hundreds of MB (the FlatFee export reached ~414 MB for ~225k
 * rows) that regex stops matching — and SheetJS then returns the sheet with its
 * declared size but NO cells, so the upload reported "File appears empty".
 *
 * This reads the zip with the browser's own DecompressionStream and walks the
 * sheet row by row, so no single string is ever larger than a chunk. Cell text
 * is still produced by SheetJS's own formatter (XLSX.SSF) following the same
 * rules as XLSX.read + sheet_to_json({ defval: '', raw: false }), so rows come
 * out identical to the old path — important, since uploads are merged with the
 * stored dataset by matching rows.
 *
 * Throws on anything it doesn't handle (not a zip, ZIP64, encrypted…); the
 * caller falls back to XLSX.read for those.
 */

// SheetJS's implicit formats for built-in ids it doesn't preload (SSFImplicit).
const SSF_IMPLICIT = {
  5: '"$"#,##0_);\\("$"#,##0\\)',
  6: '"$"#,##0_);[Red]\\("$"#,##0\\)',
  7: '"$"#,##0.00_);\\("$"#,##0.00\\)',
  8: '"$"#,##0.00_);[Red]\\("$"#,##0.00\\)',
  23: 'General', 24: 'General', 25: 'General', 26: 'General',
  27: 'm/d/yy', 28: 'm/d/yy', 29: 'm/d/yy', 30: 'm/d/yy', 31: 'm/d/yy',
  32: 'h:mm:ss', 33: 'h:mm:ss', 34: 'h:mm:ss', 35: 'h:mm:ss',
  36: 'm/d/yy',
  41: '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)',
  42: '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"_);_(@_)',
  43: '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)',
  44: '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)',
  50: 'm/d/yy', 51: 'm/d/yy', 52: 'm/d/yy', 53: 'm/d/yy', 54: 'm/d/yy',
  55: 'm/d/yy', 56: 'm/d/yy', 57: 'm/d/yy', 58: 'm/d/yy',
  59: '0', 60: '0.00', 61: '#,##0', 62: '#,##0.00',
  63: '"$"#,##0_);\\("$"#,##0\\)',
  64: '"$"#,##0_);[Red]\\("$"#,##0\\)',
  65: '"$"#,##0.00_);\\("$"#,##0.00\\)',
  66: '"$"#,##0.00_);[Red]\\("$"#,##0.00\\)',
  67: '0%', 68: '0.00%', 69: '# ?/?', 70: '# ??/??',
  71: 'm/d/yy', 72: 'm/d/yy', 73: 'd-mmm-yy', 74: 'd-mmm',
  75: 'mmm-yy', 76: 'h:mm', 77: 'h:mm:ss', 78: 'm/d/yy h:mm',
  79: 'mm:ss', 80: '[h]:mm:ss', 81: 'mmss.0',
};

// ── XML text helpers (same behaviour as SheetJS's unescapexml / parse_si) ────
const ENCODINGS = { '&quot;': '"', '&apos;': "'", '&gt;': '>', '&lt;': '<', '&amp;': '&' };
const ENC_RE = /&(?:quot|apos|gt|lt|amp|#x?([\da-fA-F]+));/ig;
const CODE_RE = /_x([\da-fA-F]{4})_/ig;

function unescapexml(text) {
  const s = text + '';
  const i = s.indexOf('<![CDATA[');
  if (i === -1) {
    return s
      .replace(ENC_RE, ($$, $1) => ENCODINGS[$$] || String.fromCharCode(parseInt($1, $$.indexOf('x') > -1 ? 16 : 10)) || $$)
      .replace(CODE_RE, (m, c) => String.fromCharCode(parseInt(c, 16)));
  }
  const j = s.indexOf(']]>');
  return unescapexml(s.slice(0, i)) + s.slice(i + 9, j) + unescapexml(s.slice(j + 3));
}

const SI_PLAIN_RE = /^\s*<(?:\w+:)?t[^>]*>/;
const SI_T_END_RE = /<\/(?:\w+:)?t>/;
const SI_RICH_RE = /<(?:\w+:)?r>/;
const SI_PH_RE = /<(?:\w+:)?rPh.*?>([\s\S]*?)<\/(?:\w+:)?rPh>/g;
const SI_RUN_T_RE = /<(?:\w+:)?t[^>]*>([^<]*)<\/(?:\w+:)?t>/g;
const TAG_RE = /<[\/\?]?[a-zA-Z0-9:_-]+(?:\s+[^"\s?>\/]+\s*=\s*(?:"[^"]*"|'[^']*'|[^'">\s=]+))*\s*[\/\?]?>/mg;

/** Text of one <si>/<is> body, or undefined when SheetJS would find none. */
function parseSi(x) {
  if (!x) return '';
  if (SI_PLAIN_RE.test(x)) return unescapexml(x.slice(x.indexOf('>') + 1).split(SI_T_END_RE)[0] || '');
  if (SI_RICH_RE.test(x)) return unescapexml((x.replace(SI_PH_RE, '').match(SI_RUN_T_RE) || []).join('').replace(TAG_RE, ''));
  return undefined;
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`(?:^|\\s)(?:\\w+:)?${name}=(?:"([^"]*)"|'([^']*)')`));
  return m ? (m[1] !== undefined ? m[1] : m[2]) : undefined;
};

// ── Cell references ──────────────────────────────────────────────────────────
function decodeCol(letters) {
  let c = 0;
  for (let i = 0; i < letters.length; ++i) {
    const cc = letters.charCodeAt(i) - 64;
    if (cc < 1 || cc > 26) break;
    c = 26 * c + cc;
  }
  return c - 1;
}
function decodeRange(ref) {
  const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec((ref || '').trim());
  if (!m) return null;
  const s = { c: decodeCol(m[1]), r: +m[2] - 1 };
  const e = m[3] ? { c: decodeCol(m[3]), r: +m[4] - 1 } : { ...s };
  return s.r <= e.r && s.c <= e.c && s.r >= 0 && s.c >= 0 ? { s, e } : null;
}

// ── Zip ──────────────────────────────────────────────────────────────────────
function readZipDirectory(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); --i) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) throw new Error('ZIP64 not supported');
  const dec = new TextDecoder();
  const entries = {};
  for (let n = 0; n < count; ++n) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Bad zip directory');
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    if (csize === 0xffffffff || usize === 0xffffffff || local === 0xffffffff) throw new Error('ZIP64 not supported');
    if (flags & 1) throw new Error('Encrypted zip not supported');
    entries[name.replace(/\\/g, '/').toLowerCase()] = { name, method, csize, usize, local };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { u8, dv, entries };
}

function entryStream(zip, entry) {
  const { u8, dv } = zip;
  const start = entry.local + 30 + dv.getUint16(entry.local + 26, true) + dv.getUint16(entry.local + 28, true);
  let stream = new Blob([u8.subarray(start, start + entry.csize)]).stream();
  if (entry.method === 8) stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
  else if (entry.method !== 0) throw new Error(`Unsupported zip compression (${entry.method})`);
  return stream.pipeThrough(new TextDecoderStream('utf-8'));
}

async function* textChunks(zip, entry) {
  const reader = entryStream(zip, entry).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

async function readText(zip, entry) {
  let s = '';
  for await (const c of textChunks(zip, entry)) s += c;
  return s;
}

function findEntry(zip, path) {
  return zip.entries[path.replace(/^\/+/, '').toLowerCase()];
}

function resolveTarget(target) {
  // workbook.xml.rels targets are relative to xl/ unless absolute
  const t = target.replace(/\\/g, '/');
  if (t.startsWith('/')) return t.slice(1);
  const parts = ('xl/' + t).split('/');
  const out = [];
  for (const part of parts) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
  return out.join('/');
}

// ── Main ─────────────────────────────────────────────────────────────────────
export async function readFirstSheetRows(buffer, XLSX, onProgress = () => {}) {
  const zip = readZipDirectory(new Uint8Array(buffer));
  const SSF = XLSX.SSF;
  // get_table(), not SSF._table: every XLSX.read swaps in a fresh table and
  // _table keeps pointing at the old one.
  const table = SSF.get_table();

  const wbEntry = findEntry(zip, 'xl/workbook.xml');
  if (!wbEntry) throw new Error('No xl/workbook.xml');
  const wbXml = await readText(zip, wbEntry);
  const firstSheet = (wbXml.match(/<(?:\w+:)?sheet\b[^>]*>/) || [])[0];
  if (!firstSheet) throw new Error('Workbook has no sheets');
  const sheetRid = attr(firstSheet, 'r:id') || attr(firstSheet, 'id');
  const wbPr = (wbXml.match(/<(?:\w+:)?workbookPr\b[^>]*>/) || [''])[0];
  const date1904 = ['1', 'true', 'TRUE'].includes(attr(wbPr, 'date1904'));
  const ssfOpts = { date1904 };

  const relsEntry = findEntry(zip, 'xl/_rels/workbook.xml.rels');
  const rels = relsEntry ? await readText(zip, relsEntry) : '';
  const relTags = rels.match(/<(?:\w+:)?Relationship\b[^>]*>/g) || [];
  const relBy = (pred) => relTags.find(pred);
  const sheetRel = relBy(t => attr(t, 'Id') === sheetRid);
  const sheetEntry = findEntry(zip, sheetRel ? resolveTarget(attr(sheetRel, 'Target')) : 'xl/worksheets/sheet1.xml');
  if (!sheetEntry) throw new Error('First worksheet not found');
  const sstRel = relBy(t => /\/sharedStrings$/.test(attr(t, 'Type') || ''));
  const stylesRel = relBy(t => /\/styles$/.test(attr(t, 'Type') || ''));
  const sstEntry = findEntry(zip, sstRel ? resolveTarget(attr(sstRel, 'Target')) : 'xl/sharedStrings.xml');
  const stylesEntry = findEntry(zip, stylesRel ? resolveTarget(attr(stylesRel, 'Target')) : 'xl/styles.xml');

  // Styles: custom number formats + the numFmtId of each cell style (cellXfs)
  const cellXfNumFmt = [];
  if (stylesEntry) {
    const sty = await readText(zip, stylesEntry);
    const numberFmt = {};
    for (const k of Object.keys(table)) numberFmt[k] = table[k];
    const nf = sty.match(/<(?:\w+:)?numFmts\b[\s\S]*?<\/(?:\w+:)?numFmts>/);
    for (const t of (nf ? nf[0].match(/<(?:\w+:)?numFmt\b[^>]*>/g) || [] : [])) {
      const f = unescapexml(attr(t, 'formatCode') || '');
      let j = parseInt(attr(t, 'numFmtId'), 10);
      numberFmt[j] = f;
      if (j > 0) {
        if (j > 0x188) {
          for (j = 0x188; j > 0x3c; --j) if (numberFmt[j] == null) break;
          numberFmt[j] = f;
        }
        SSF.load(f, j);
      }
    }
    const xfs = sty.match(/<(?:\w+:)?cellXfs\b[\s\S]*?<\/(?:\w+:)?cellXfs>/);
    for (const t of (xfs ? xfs[0].match(/<(?:\w+:)?xf\b[^>]*>/g) || [] : [])) {
      const raw = attr(t, 'numFmtId');
      let id = raw ? parseInt(raw, 10) : undefined;
      if (id > 0x188) {
        for (let i = 0x188; i > 0x3c; --i) if (numberFmt[id] == numberFmt[i]) { id = i; break; }
      }
      cellXfNumFmt.push(id);
    }
  }
  const doFormat = cellXfNumFmt.length > 0;

  // Shared strings, streamed <si> by <si>
  const sst = [];
  if (sstEntry) {
    onProgress(15, 'Reading text values…');
    let carry = '';
    let inside = false;
    for await (const chunk of textChunks(zip, sstEntry)) {
      carry += chunk;
      if (!inside) {
        const open = carry.search(/<(?:\w+:)?sst\b[^>]*>/);
        if (open < 0) continue;
        carry = carry.slice(carry.indexOf('>', open) + 1);
        inside = true;
      }
      const parts = carry.split(/<\/(?:\w+:)?(?:si|sstItem)>/);
      carry = parts.pop();
      for (const part of parts) sst.push(parseSi(part.replace(/<(?:\w+:)?(?:si|sstItem)>/g, '').trim()));
    }
  }

  // Worksheet, streamed row by row
  const fmtCell = (t, v, fmtid) => {
    // Mirrors SheetJS safe_format(): the cell's displayed text (.w)
    if (table[fmtid] == null) SSF.load(SSF_IMPLICIT[fmtid] || 'General', fmtid);
    try {
      if (fmtid === 0 && t === 's' && v === undefined) return undefined;
      return SSF.format(fmtid, v, ssfOpts);
    } catch {
      try { return SSF.format(SSF.is_date(table[fmtid] || '') ? 14 : 0, v, ssfOpts); } catch { return '' + v; }
    }
  };

  let range = null;       // from <dimension>, like SheetJS
  let header = null;      // column index → key
  const out = [];
  const pending = [];     // rows seen before the range is known (no <dimension>)
  let guess = { s: { r: 2e6, c: 2e6 }, e: { r: 0, c: 0 } };
  let tagr = 0;

  const buildHeader = (cells) => {
    header = [];
    const counts = {};
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = cells && cells[C];
      const v = cell ? (cell.w !== undefined ? cell.w : '') : '__EMPTY';
      let name = v;
      let counter = counts[v] || 0;
      if (!counter) counts[v] = 1;
      else {
        do { name = v + '_' + (counter++); } while (counts[name]);
        counts[v] = counter;
        counts[name] = 1;
      }
      header[C] = name;
    }
  };

  const emitRow = (R, cells) => {
    if (R < range.s.r || R > range.e.r) return;
    if (R === range.s.r) { buildHeader(cells); return; }
    if (!header) buildHeader(null);
    const row = {};
    let empty = true;
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = cells[C];
      if (cell === undefined) { row[header[C]] = ''; continue; }
      if (cell.t === 'e') { row[header[C]] = cell.isNull ? null : ''; continue; }
      if (cell.v == null) { row[header[C]] = ''; continue; }
      row[header[C]] = cell.w !== undefined ? cell.w : '' + cell.v;
      empty = false;
    }
    if (!empty) out.push(row);
  };

  const ROW_RE = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
  const CELL_RE = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  const V_RE = /<(?:\w+:)?v(?: xml:space="preserve")?(?:[^>]*)>([\s\S]*?)<\/(?:\w+:)?v>/;
  const F_RE = /<(?:\w+:)?f\b/;
  const IS_RE = /<(?:\w+:)?is>([\S\s]*?)<\/(?:\w+:)?is>/;

  const parseRows = (text) => {
    ROW_RE.lastIndex = 0;
    let m;
    while ((m = ROW_RE.exec(text))) {
      const rAttr = attr(m[1], 'r');
      tagr = rAttr != null ? parseInt(rAttr, 10) : tagr + 1;
      const R = tagr - 1;
      if (guess.s.r > R) guess.s.r = R;
      if (guess.e.r < R) guess.e.r = R;
      const cells = [];
      let tagc = -1;
      const body = m[2] || '';
      CELL_RE.lastIndex = 0;
      let c;
      while ((c = CELL_RE.exec(body))) {
        const ref = attr(c[1], 'r');
        tagc = ref ? decodeCol(ref) : tagc + 1;
        const t = attr(c[1], 't');
        const s = attr(c[1], 's');
        const inner = c[2] || '';
        const vm = inner.match(V_RE);
        let v = vm && vm[1] !== '' ? unescapexml(vm[1]) : undefined;
        let type = t;
        if (t == null && v === undefined) {
          if (F_RE.test(inner)) { v = 0; type = 'n'; } else continue;
        } else type = t || 'n';
        if (guess.s.c > tagc) guess.s.c = tagc;
        if (guess.e.c < tagc) guess.e.c = tagc;
        const cell = { t: type };
        switch (type) {
          case 'n':
            if (v === '' || v == null) continue;
            cell.v = parseFloat(v);
            break;
          case 's':
            if (v === undefined) continue;
            cell.v = sst[parseInt(v, 10)];
            break;
          case 'str':
            cell.t = 's';
            cell.v = v != null ? v : '';
            break;
          case 'inlineStr': {
            const im = inner.match(IS_RE);
            cell.t = 's';
            cell.v = im ? parseSi(im[1]) : '';
            if (cell.v === undefined) cell.v = '';
            break;
          }
          case 'b':
            cell.v = ['1', 'true', 'TRUE'].includes(v);
            break;
          case 'e':
            cell.w = v;
            cell.isNull = v === '#NULL!';
            break;
          default:
            // 'd' (ISO date text) — not written by Excel; keep the text as is
            cell.t = 's';
            cell.v = v;
        }
        if (cell.t !== 'e') {
          let fmtid = 0;
          if (doFormat && s !== undefined) {
            const id = cellXfNumFmt[parseInt(s, 10)];
            if (id != null) fmtid = id;
          }
          cell.w = fmtCell(cell.t, cell.v, fmtid);
        }
        cells[tagc] = cell;
      }
      if (range) emitRow(R, cells);
      else pending.push([R, cells]);
    }
  };

  onProgress(25, 'Reading rows…');
  let carry = '';
  let seen = 0;
  let lastPct = 25;
  let lookedForDimension = false;
  for await (const chunk of textChunks(zip, sheetEntry)) {
    carry += chunk;
    seen += chunk.length;
    if (!lookedForDimension) {
      const sd = carry.search(/<(?:\w+:)?sheetData\b/);
      if (sd < 0 && carry.length < 1e6) continue;
      const head = sd < 0 ? carry : carry.slice(0, sd);
      const dim = head.match(/<(?:\w*:)?dimension\b[^>]*>/);
      // SheetJS only trusts a "from:to" range here; a lone "A1" means "work
      // it out from the cells", which is what happens below when range stays null.
      const ref = dim && attr(dim[0], 'ref');
      if (ref && ref.includes(':')) range = decodeRange(ref);
      lookedForDimension = true;
    }
    const cut = carry.lastIndexOf('</row>');
    if (cut < 0) continue;
    const end = carry.indexOf('>', cut) + 1;
    parseRows(carry.slice(0, end));
    carry = carry.slice(end);
    const pct = 25 + Math.floor(70 * Math.min(1, seen / Math.max(1, sheetEntry.usize)));
    if (pct >= lastPct + 3) { lastPct = pct; onProgress(pct, `Reading rows… ${out.length.toLocaleString()}`); }
  }
  parseRows(carry);

  if (!range) {
    if (guess.e.c < guess.s.c || guess.e.r < guess.s.r) return [];
    range = guess;
    for (const [R, cells] of pending) emitRow(R, cells);
  }
  return out;
}
