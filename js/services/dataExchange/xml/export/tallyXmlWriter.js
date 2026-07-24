// xml/export/tallyXmlWriter.js
// A pure, generic XML tree -> text serializer. Knows nothing about items,
// customers, sales, companies, or Tally itself -- no tag names, no `.LIST`
// convention, no envelope shape. Every structural/format decision belongs
// to a formatter (see tallyXmlFormatterV1.js), one layer up; this file only
// turns an already-built node tree into correct, escaped, indented XML text.
//
// A node is either:
//   xmlElement(tag, attrs, children)  -- attrs: ordered [name, value][] pairs
//                                         (never a plain object -- key order
//                                         on an object is an implementation
//                                         accident, not a guarantee, and
//                                         output determinism depends on it)
//                                      -- children: nested nodes; [] renders
//                                         self-closing (<TAG/>)
//   xmlText(tag, value, attrs)         -- a leaf with text content; an empty
//                                         string also renders self-closing,
//                                         matching Tally's own convention
//                                         that <PARENT/> and an empty text
//                                         node are equivalent

export function xmlElement (tag, attrs = [], children = []) {
  return { tag, attrs, children };
}

export function xmlText (tag, value, attrs = []) {
  return { tag, attrs, text: value == null ? '' : String(value) };
}

function escapeText (value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr (value) {
  return escapeText(value).replace(/"/g, '&quot;');
}

function attrsToString (attrs) {
  if (!attrs || !attrs.length) return '';
  return attrs.map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('');
}

function isEmptyLeaf (node) {
  if ('text' in node) return node.text === '';
  return Array.isArray(node.children) && node.children.length === 0;
}

function walk (node, depth, out) {
  const indent = '  '.repeat(depth);
  const openTag = `${node.tag}${attrsToString(node.attrs)}`;

  if (isEmptyLeaf(node)) {
    out.push(`${indent}<${openTag}/>`);
    return;
  }

  if ('text' in node) {
    out.push(`${indent}<${openTag}>${escapeText(node.text)}</${node.tag}>`);
    return;
  }

  out.push(`${indent}<${openTag}>`);
  for (const child of node.children) walk(child, depth + 1, out);
  out.push(`${indent}</${node.tag}>`);
}

/** @param {object} rootElement an xmlElement node @returns {string} full XML document text, UTF-8 */
export function serialize (rootElement) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
  walk(rootElement, 0, out);
  return out.join('\n') + '\n';
}
