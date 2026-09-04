// Owner data for the analysis desk. A CSV attached to the message is parsed
// and profiled here: the first numeric column becomes the series, the first
// text column its labels, and a second text column (if any) the segment
// breakdown. The profile is what the charts plot and what the author and the
// tape describe, real numbers, named by file, never sample data.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text).replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const table = rows.filter((r) => r.some((x) => String(x).trim() !== ''));
  if (table.length < 2) return null;
  const headers = table[0].map((h, i) => String(h).trim() || `col${i + 1}`);
  return { headers, rows: table.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? '').trim())) };
}

const num = (v) => { const x = Number(String(v).replace(/[,₹$€£%\s]/g, '')); return Number.isFinite(x) && String(v).trim() !== '' ? x : null; };

export function looksLikeCsv(name, text) {
  if (/\.csv$/i.test(name || '')) return true;
  const lines = String(text).split(/\r?\n/).filter(Boolean).slice(0, 6);
  return lines.length >= 3 && lines.every((l) => l.includes(',')) && new Set(lines.map((l) => l.split(',').length)).size === 1;
}

export function profileCsv(name, text) {
  const t = parseCsv(text);
  if (!t) return null;
  const { headers, rows } = t;
  const numeric = headers.map((h, i) => ({ h, i, share: rows.filter((r) => num(r[i]) !== null).length / rows.length })).filter((c) => c.share >= 0.8);
  const textual = headers.map((h, i) => ({ h, i, distinct: new Set(rows.map((r) => r[i])).size })).filter((c) => !numeric.some((n) => n.i === c.i));
  if (!numeric.length) return { name, rows: rows.length, columns: headers, notes: ['no numeric column found, nothing to plot'] };
  const prefer = numeric.find((c) => /revenue|value|amount|count|total|sales|users|spend|cost|score/i.test(c.h)) || numeric[0];
  const labelCol = textual.find((c) => c.distinct >= Math.min(rows.length, 3)) || null;
  const segCol = textual.find((c) => c !== labelCol && c.distinct >= 2 && c.distinct <= 12) || null;
  const series = rows.map((r) => ({ label: labelCol ? r[labelCol.i] : '', value: num(r[prefer.i]) })).filter((p) => p.value !== null).slice(0, 24);
  let segments = null;
  if (segCol) {
    const agg = new Map();
    for (const r of rows) { const v = num(r[prefer.i]); if (v === null) continue; agg.set(r[segCol.i], (agg.get(r[segCol.i]) || 0) + v); }
    segments = { column: segCol.h, items: [...agg.entries()].map(([k, v]) => ({ name: k, value: Math.round(v * 100) / 100 })).sort((a, b) => b.value - a.value).slice(0, 8) };
  }
  const values = series.map((p) => p.value);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    name, rows: rows.length, columns: headers,
    series: { column: prefer.h, labelColumn: labelCol?.h || null, points: series },
    segments,
    stats: { sum: Math.round(sum * 100) / 100, mean: Math.round((sum / (values.length || 1)) * 100) / 100, min: Math.min(...values), max: Math.max(...values), first: values[0], last: values.at(-1) },
    notes: [`${rows.length} rows × ${headers.length} columns`, `series: ${prefer.h}${labelCol ? ` by ${labelCol.h}` : ''}`, segCol ? `segments: ${segCol.h} (${segCol.distinct})` : 'no segment column'],
  };
}

export function dataSummary(d) {
  if (!d || !d.series) return '';
  const pts = d.series.points.map((p) => `${p.label ? `${p.label}: ` : ''}${p.value}`).join(', ');
  const segs = d.segments ? d.segments.items.map((s) => `${s.name}: ${s.value}`).join(', ') : 'none';
  return `Owner data from ${d.name} (${d.rows} rows): series ${d.series.column}${d.series.labelColumn ? ` by ${d.series.labelColumn}` : ''} = [${pts}]; sum ${d.stats.sum}, mean ${d.stats.mean}, min ${d.stats.min}, max ${d.stats.max}; segments by ${d.segments?.column || '–'}: ${segs}.`;
}
