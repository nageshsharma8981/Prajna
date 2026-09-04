// Word out of the house, without a dependency. A .docx is a zip of XML, and
// the house already writes zips (the export) and reads them (the Documents
// plugin), so a delivery can leave in the format a reader expects. The
// document is built from the artifact itself, block by block, so what is in
// the Word file is what was delivered, provenance and all.
import { zipStore } from './export.js';

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();

// The artifact's own blocks, in order. Scripts, styles and the machine-readable
// provenance object are left out; everything a reader sees is kept.
export function blocksFromHtml(html) {
  const body = String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ');
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
