// Word out of the house, without a dependency. A .docx is a zip of XML, and
// the house already writes zips (the export) and reads them (the Documents
// plugin), so a delivery can leave in the format a reader expects. The
// document is built from the artifact itself, block by block, so what is in
// the Word file is what was delivered, provenance and all.
import { zipStore } from './export.js';
import zlib from 'node:zlib';

// A 64 by 64 speaker icon, drawn in code so the package needs no asset.
function speakerPng() {
  const W = 64, H = 64, raw = Buffer.alloc((W * 4 + 1) * H);
  const inside = (x, y) => {
    const box = x >= 14 && x <= 26 && y >= 24 && y <= 40;
    const cone = x > 26 && x <= 38 && y >= 24 - (x - 26) && y <= 40 + (x - 26);
    const r1 = Math.hypot(x - 36, y - 32), ring1 = r1 >= 10 && r1 <= 12.5 && x > 40;
    const r2 = Math.hypot(x - 36, y - 32), ring2 = r2 >= 16 && r2 <= 18.5 && x > 42;
    return box || cone || ring1 || ring2;
  };
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const i = y * (W * 4 + 1) + 1 + x * 4;
      const on = inside(x, y); const round = Math.hypot(Math.max(0, Math.abs(x - 31.5) - 23.5), Math.max(0, Math.abs(y - 31.5) - 23.5)) <= 8;
      raw[i] = on ? 251 : 18; raw[i + 1] = on ? 247 : 22; raw[i + 2] = on ? 238 : 20; raw[i + 3] = round ? 235 : 0;
    }
  }
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable.push(c >>> 0); }
  const crc = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();

// The artifact's own blocks, in order. Scripts, styles and the machine-readable
// provenance object are left out; everything a reader sees is kept.
export function blocksFromHtml(html) {
  // The page's working parts stay on the page: the evidence filter, the
  // decision form and what it recorded, chart readouts, table notes, app
  // hints, form errors. A Word document is the prose and the tables.
  const body = String(html || '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ')
    .replace(/<form\b[\s\S]*?<\/form>/gi, ' ')
    .replace(/<div class="(?:filter|decided|joined|presenter|overview|chrome)"[\s\S]*?<\/div>/gi, ' ')
    .replace(/<aside class="notes"[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<p class="(?:readout|table-note|hint|count|err|filter-count)"[^>]*>[\s\S]*?<\/p>/gi, ' ')
    .replace(/<h2>4b · Your decision<\/h2>\s*<p class="docline"[^>]*>[\s\S]*?<\/p>/gi, ' ')
    .replace(/<td class="cited-by">[\s\S]*?<\/td>/gi, ' ')
    .replace(/<th>Leaned on by<\/th>/gi, ' ');
  const out = [];
  const re = /<(h1|h2|h3|p|li|td|th|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase();
    const text = strip(m[2]);
    if (!text || text.length > 4000) continue;
    if (/^\{[\s\S]*\}$/.test(text)) continue; // the machine-readable record, not prose
    out.push({ tag, text });
  }
  return out;
}

const P = (text, { size = 22, bold = false, spaceAfter = 120, bullet = false } = {}) =>
  `<w:p><w:pPr>${bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}<w:spacing w:after="${spaceAfter}"/></w:pPr><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

export function docxFromArtifact({ artifact, mission, html, publicUrl }) {
  const blocks = blocksFromHtml(html);
  const paras = [];
  paras.push(P(artifact.title, { size: 44, bold: true, spaceAfter: 80 }));
  paras.push(P(`${artifact.serial} · ${artifact.desk} · v${artifact.version} · delivered ${new Date(artifact.createdAt).toISOString().slice(0, 10)}`, { size: 18, spaceAfter: 300 }));
  let skippedTitle = false;
  for (const b of blocks) {
    if (!skippedTitle && b.tag === 'h1' && b.text.trim() === String(artifact.title).trim()) { skippedTitle = true; continue; }
    if (b.tag === 'h1') paras.push(P(b.text, { size: 36, bold: true, spaceAfter: 160 }));
    else if (b.tag === 'h2') paras.push(P(b.text, { size: 28, bold: true, spaceAfter: 140 }));
    else if (b.tag === 'h3' || b.tag === 'th') paras.push(P(b.text, { size: 24, bold: true, spaceAfter: 100 }));
    else if (b.tag === 'li') paras.push(P(b.text, { bullet: true }));
    else paras.push(P(b.text));
  }
  paras.push(P('Provenance', { size: 28, bold: true, spaceAfter: 140 }));
  paras.push(P(`Written by Prajñā as mission ${artifact.serial}${mission?.settlement ? `, settled ${mission.settlement.settled} of a ${mission.contract?.ceiling} credit ceiling` : ''}. ${mission?.authored?.live ? `The substance was written by ${mission.authored.model} on the owner's own key.` : mission?.authored?.composed ? 'No model was loaded: every claim is quoted from a source on the table, or counted from the owner’s own file.' : 'No model was loaded: the substance is house-scripted sample material, labelled as such.'}${publicUrl ? ` The full record, including the tape and every decision, is at ${publicUrl}.` : ''}`, { size: 18 }));

  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(artifact.title)}</dc:title><dc:creator>Prajñā · ${esc(artifact.serial)}</dc:creator><cp:lastModifiedBy>Prajñā</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date(artifact.createdAt).toISOString()}</dcterms:created></cp:coreProperties>`;

  return zipStore([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rels },
    { name: 'docProps/core.xml', data: core },
    { name: 'word/document.xml', data: doc },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'word/numbering.xml', data: numbering },
  ], new Date(artifact.createdAt || Date.now()));
}

// PowerPoint out of the house, the same way: a .pptx is a zip of XML. Slides
// are taken from the deck the house delivered, one section each, so the file
// carries the same words in the same order, with the recorded dissent and the
// provenance on a closing slide rather than dropped on the way out.
export function slidesFromHtml(html) {
  const out = [];
  const re = /<section class="slide([^"]*)"([^>]*)>([\s\S]*?)<\/section>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const kind = (m[1] || '').trim();
    const visual = (m[2].match(/data-visual="([^"]+)"/) || [])[1] || null;
    const narration = (m[2].match(/data-narration="([^"]+)"/) || [])[1] || null;
    const inner = m[3];
    const head = (inner.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i) || [])[1];
    const sub = (inner.match(/<p class="sub"[^>]*>([\s\S]*?)<\/p>/i) || [])[1];
    const run = (inner.match(/<p class="run"[^>]*>([\s\S]*?)<\/p>/i) || [])[1];
    const dissent = (inner.match(/<p class="deck-dissent"[^>]*>([\s\S]*?)<\/p>/i) || [])[1];
    const notes = (inner.match(/<aside class="notes"[^>]*>([\s\S]*?)<\/aside>/i) || [])[1];
    if (!head && !sub) continue;
    out.push({ kind, title: strip(head || ''), body: [strip(sub || ''), dissent ? strip(dissent) : ''].filter(Boolean).join('  '), label: strip(run || ''), notes: strip(notes || ''), visual, narration });
  }
  return out;
}

const EMU = { w: 12192000, h: 6858000 }; // 16:9
// The deck's look, read back from the page it came from, so an export of a
// shared page wears the same colours and type as the page.
const H6 = (v, d) => { const m = String(v || '').trim().match(/^#?([0-9a-f]{6})$/i); return m ? m[1].toUpperCase() : d; };
const mix = (a, b, t) => { const c = (h, i) => parseInt(h.slice(i, i + 2), 16); return [0, 2, 4].map((i) => Math.round(c(a, i) * (1 - t) + c(b, i) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };
export function lookFromHtml(html) {
  const root = (String(html || '').match(/:root\{([^}]*)\}/) || [])[1] || '';
  const v = (k) => (root.match(new RegExp(`--${k}:([^;]+)`)) || [])[1];
  const paper = H6(v('paper'), 'F5F1E6'), ink = H6(v('ink'), '121614'), acc = H6(v('acc'), 'B0472F');
  const display = String(v('display') || '');
  const serif = /serif/i.test(display) && !/sans-serif/i.test(display.split(',')[0]);
  return { paper, ink, acc, soft: mix(ink, paper, 0.28), faint: mix(ink, paper, 0.55), face: serif ? 'Georgia' : 'Helvetica Neue', serif };
}
function slideXml(s, n, total, L) {
  const lit = !!s.pic;
  const inkT = lit ? 'FBF7EE' : L.ink, inkB = lit ? 'E6DDCC' : L.soft, inkF = lit ? 'CFC8B8' : L.acc;
  const audio = s.audio ? `<p:pic><p:nvPicPr><p:cNvPr id="7" name="Narration ${n}"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr><a:audioFile r:link="rId4"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rId5"/></p:ext></p:extLst></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="rId6"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${EMU.w - 838200}" y="${EMU.h - 838200}"/><a:ext cx="457200" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` : '';
  const pic = lit ? `<p:pic><p:nvPicPr><p:cNvPr id="5" name="Visual ${n}" descr="${esc(s.alt || '')}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId3"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${EMU.w}" cy="${EMU.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic><p:sp><p:nvSpPr><p:cNvPr id="6" name="Scrim ${n}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(EMU.w * 0.62)}" cy="${EMU.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="0A0A08"><a:alpha val="72000"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>` : '';
  const title = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title ${n}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="838200" y="${s.kind.includes('title') || s.kind.includes('big') ? 2200000 : 1000000}"/><a:ext cx="${lit ? 6400000 : 10515600}" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-GB" sz="${s.kind.includes('title') ? 4400 : 3200}" b="1" dirty="0"><a:solidFill><a:srgbClr val="${inkT}"/></a:solidFill><a:latin typeface="${L.face}"/></a:rPr><a:t>${esc(s.title)}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const body = s.body ? `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body ${n}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="838200" y="${s.kind.includes('title') || s.kind.includes('big') ? 4300000 : 3200000}"/><a:ext cx="${lit ? 6400000 : 10515600}" cy="2200000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-GB" sz="1800" dirty="0"><a:solidFill><a:srgbClr val="${inkB}"/></a:solidFill></a:rPr><a:t>${esc(s.body)}</a:t></a:r></a:p></p:txBody></p:sp>` : '';
  const foot = `<p:sp><p:nvSpPr><p:cNvPr id="4" name="Foot ${n}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="838200" y="6100000"/><a:ext cx="10515600" cy="400000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-GB" sz="1100" dirty="0"><a:solidFill><a:srgbClr val="${inkF}"/></a:solidFill></a:rPr><a:t>${esc(`${s.label ? `${s.label} · ` : ''}${n} / ${total}`)}</a:t></a:r></a:p></p:txBody></p:sp>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${L.paper}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${pic}${title}${body}${foot}${audio}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

export function pptxFromArtifact({ artifact, mission, html, publicUrl, mediaBytes }) {
  const slides = slidesFromHtml(html);
  if (!slides.length) return null;
  const L = lookFromHtml(html);
  // The pictures travel inside the package. A slide whose file is missing
  // goes out without one rather than pointing at a picture that is not there.
  const alts = Object.fromEntries((mission?.visuals || []).map((v) => [v.file, String(v.prompt || '').replace(/^.*?Subject: /, '').slice(0, 200)]));
  for (const s of slides) {
    if (!s.visual || typeof mediaBytes !== 'function') continue;
    const bytes = mediaBytes(s.visual);
    if (bytes && bytes.length) { s.pic = { name: s.visual, bytes, ext: s.visual.split('.').pop().toLowerCase() }; s.alt = alts[s.visual] || s.title; }
  }
  // And the narration: each slide's spoken clip, on the slide, behind a
  // speaker. PowerPoint plays it from the icon, or automatically once the
  // presenter asks it to.
  let anyAudio = false;
  for (const s of slides) {
    if (!s.narration || typeof mediaBytes !== 'function') continue;
    const bytes = mediaBytes(`${s.narration}.wav`);
    if (bytes && bytes.length > 44) { s.audio = { bytes }; anyAudio = true; }
  }
  slides.push({
    kind: '', title: 'Provenance',
    body: `${artifact.serial} · ${artifact.desk} · v${artifact.version}. ${mission?.authored?.live ? `The substance was written by ${mission.authored.model} on the owner's own key.` : mission?.authored?.composed ? 'No model was loaded: the substance is quoted from the sources on the table.' : 'No model was loaded: the substance is house-scripted sample material, labelled as such.'}${mission?.settlement ? ` Settled ${mission.settlement.settled} of a ${mission.contract?.ceiling} credit ceiling.` : ''}${publicUrl ? ` Full record: ${publicUrl}` : ''}`,
    label: 'Prajñā',
  });
  const total = slides.length;
  const ids = slides.map((_, i) => i + 1);
  const files = [];
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  // What the presenter says, in the pane PowerPoint keeps for it.
  const notesXml = (s, i) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder ${i}"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder ${i}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-GB" dirty="0"/><a:t>${esc(s.notes || '')}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
  files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="webp" ContentType="image/webp"/><Default Extension="wav" ContentType="audio/wav"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${ids.map((i) => `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/notesSlides/notesSlide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`).join('')}<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/></Types>` });
  files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` });
  files.push({ name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(artifact.title)}</dc:title><dc:creator>Prajñā · ${esc(artifact.serial)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date(artifact.createdAt).toISOString()}</dcterms:created></cp:coreProperties>` });
  files.push({ name: 'ppt/presentation.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${ids.map((i) => `<p:sldId id="${255 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId${total + 3}"/></p:notesMasterIdLst><p:sldSz cx="${EMU.w}" cy="${EMU.h}"/><p:notesSz cx="${EMU.h}" cy="${EMU.w}"/></p:presentation>` });
  files.push({ name: 'ppt/_rels/presentation.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${ids.map((i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`).join('')}<Relationship Id="rId${total + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId${total + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/></Relationships>` });
  for (const [i, s] of slides.entries()) {
    files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: slideXml(s, i + 1, total, L) });
    files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${i + 1}.xml"/>${s.pic ? `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i + 1}.${s.pic.ext}"/>` : ''}${s.audio ? `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/audio${i + 1}.wav"/><Relationship Id="rId5" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="../media/audio${i + 1}.wav"/><Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/speaker.png"/>` : ''}</Relationships>` });
    if (s.pic) files.push({ name: `ppt/media/image${i + 1}.${s.pic.ext}`, data: s.pic.bytes });
    if (s.audio) files.push({ name: `ppt/media/audio${i + 1}.wav`, data: s.audio.bytes });
    files.push({ name: `ppt/notesSlides/notesSlide${i + 1}.xml`, data: notesXml(s, i + 1) });
    files.push({ name: `ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${i + 1}.xml"/></Relationships>` });
  }
  if (anyAudio) files.push({ name: 'ppt/media/speaker.png', data: speakerPng() });
  files.push({ name: 'ppt/notesMasters/notesMaster1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notesMaster ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="1143000" y="685800"/><a:ext cx="4572000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4343400"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-GB"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr></p:notesStyle></p:notesMaster>` });
  files.push({ name: 'ppt/notesMasters/_rels/notesMaster1.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>` });
  files.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>` });
  files.push({ name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>` });
  files.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>` });
  files.push({ name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>` });
  files.push({ name: 'ppt/theme/theme1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Prajñā"><a:themeElements><a:clrScheme name="Prajñā"><a:dk1><a:srgbClr val="${L.ink}"/></a:dk1><a:lt1><a:srgbClr val="${L.paper}"/></a:lt1><a:dk2><a:srgbClr val="${L.soft}"/></a:dk2><a:lt2><a:srgbClr val="${L.faint}"/></a:lt2><a:accent1><a:srgbClr val="${L.acc}"/></a:accent1><a:accent2><a:srgbClr val="7FBF9A"/></a:accent2><a:accent3><a:srgbClr val="E05A4E"/></a:accent3><a:accent4><a:srgbClr val="9A9583"/></a:accent4><a:accent5><a:srgbClr val="8FD19E"/></a:accent5><a:accent6><a:srgbClr val="235C40"/></a:accent6><a:hlink><a:srgbClr val="FFB300"/></a:hlink><a:folHlink><a:srgbClr val="9A9583"/></a:folHlink></a:clrScheme><a:fontScheme name="Prajñā"><a:majorFont><a:latin typeface="${L.face}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Helvetica Neue"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Prajñā"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>` });
  return zipStore(files, new Date(artifact.createdAt || Date.now()));
}

// Excel out of the house. An analysis computes a series, segments and their
// arithmetic from the owner's own file; this hands that work back as a
// workbook they can carry on with, with the provenance on its own sheet so
// the numbers never travel without their origin.
const colName = (n) => { let s = ''; n += 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

function sheetXml(rows, strings) {
  const body = rows.map((cells, r) => {
    const cs = cells.map((v, c) => {
      const ref = `${colName(c)}${r + 1}`;
      if (v === null || v === undefined || v === '') return '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      const text = String(v);
      let i = strings.indexOf(text);
      if (i < 0) { strings.push(text); i = strings.length - 1; }
      return `<c r="${ref}" t="s"><v>${i}</v></c>`;
    }).join('');
    return `<row r="${r + 1}">${cs}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export function xlsxFromMission({ artifact, mission, publicUrl }) {
  const d = mission?.data;
  if (!d || !d.series || !Array.isArray(d.series.points)) return null;
  const strings = [];
  const sheets = [];
  const st = d.stats || {};
  sheets.push({ name: 'Series', rows: [
    [d.series.labelColumn || 'Row', d.series.column],
    ...d.series.points.map((p) => [p.label ?? '', p.value]),
    [], ['Count', d.series.points.length], ['Sum', st.sum ?? null], ['Mean', st.mean ?? null], ['Minimum', st.min ?? null], ['Maximum', st.max ?? null], ['First', st.first ?? null], ['Last', st.last ?? null],
  ] });
  if (d.segments?.items?.length) {
    const total = d.segments.items.reduce((a, x) => a + x.value, 0) || 1;
    sheets.push({ name: 'Segments', rows: [
      [d.segments.column, d.series.column, 'Share'],
      ...d.segments.items.map((x) => [x.name, x.value, Math.round((x.value / total) * 1000) / 10]),
      [], ['Total', Math.round(total * 100) / 100, 100],
    ] });
  }
  const A = mission.authored?.content;
  sheets.push({ name: 'Provenance', rows: [
    ['Provenance', 'where these numbers came from'],
    ['Delivery', artifact.title],
    ['Mission', artifact.serial], ['Desk', artifact.desk], ['Version', artifact.version],
    ['Delivered', new Date(artifact.createdAt).toISOString().slice(0, 10)],
    ['Data', `${d.name}, ${d.rows} rows × ${d.columns.length} columns, attached by the owner`],
    ['Substance', mission.authored?.live ? `Written by ${mission.authored.model} on the owner's own key` : mission.authored?.composed ? 'No model was loaded: every figure is arithmetic over the attached file, nothing estimated' : 'No model was loaded: house-scripted sample material, labelled as such'],
    ['Settled', mission.settlement ? `${mission.settlement.settled} of a ${mission.contract?.ceiling} credit ceiling` : ''],
    ...(publicUrl ? [['Record', publicUrl]] : []),
    ...(A?.read ? [[], ['The read', A.read]] : []),
    ...(A?.caveat ? [[], ['Caveat', A.caveat]] : []),
  ] });

  const files = [];
  const sheetXmls = sheets.map((s) => sheetXml(s.rows, strings));
  files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` });
  files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` });
  files.push({ name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(artifact.title)}</dc:title><dc:creator>Prajñā · ${esc(artifact.serial)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date(artifact.createdAt).toISOString()}</dcterms:created></cp:coreProperties>` });
  files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>` });
  sheetXmls.forEach((xml, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml }));
  files.push({ name: 'xl/sharedStrings.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>` });
  return zipStore(files, new Date(artifact.createdAt || Date.now()));
}
