// The Documents plugin: read the text out of Word (.docx) and PowerPoint
// (.pptx) files without any dependency. Both are zip archives of XML; this
// walks the central directory, inflates the parts that carry text, and
// strips the markup. Good enough for evidence; not a full converter.
import zlib from 'node:zlib';

export function zipEntries(buf) { return entries(buf); }
export function zipRead(buf, e) { return read(buf, e); }
function entries(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip archive');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    out.push({ name, method, csize, local });
    off += 46 + nlen + elen + clen;
  }
  return out;
}
function read(buf, e) {
  const nlen = buf.readUInt16LE(e.local + 26), elen = buf.readUInt16LE(e.local + 28);
  const start = e.local + 30 + nlen + elen;
  const data = buf.subarray(start, start + e.csize);
  return e.method === 8 ? zlib.inflateRawSync(data) : e.method === 0 ? data : null;
}
const textOf = (xml, tag) => [...String(xml).matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g'))].map((m) => m[1]).join(' ');
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export function extractText(name, buf, limit = 200000) {
  const es = entries(buf);
  const get = (n) => { const e = es.find((x) => x.name === n); return e ? read(buf, e) : null; };
  let text = '';
  if (/\.docx$/i.test(name)) {
    const xml = get('word/document.xml');
    if (!xml) throw new Error('no word/document.xml in the file');
    text = String(xml).replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t');
    text = [...text.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|\n/g)].map((m) => (m[0] === '\n' ? '\n' : m[1])).join('');
  } else if (/\.pptx$/i.test(name)) {
    const slides = es.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name)).sort((a, b) => Number(a.name.match(/\d+/)[0]) - Number(b.name.match(/\d+/)[0]));
    text = slides.map((e, i) => `Slide ${i + 1}: ${textOf(read(buf, e), 'a:t')}`).join('\n');
  } else if (/\.xlsx$/i.test(name)) {
    const shared = get('xl/sharedStrings.xml');
    text = shared ? textOf(shared, 't') : '';
  } else throw new Error('unsupported document type');
  return unescape(text).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, limit);
}
