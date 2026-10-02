import { wordCount, withinTextLimits } from './input.js';
export function validText(value, max, minWords = 8) { return typeof value === 'string' && value.length <= max && withinTextLimits(value) && wordCount(value) >= minWords; }
export async function hashText(text) { const normalized = text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim(); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function readBody(req, max = 64 * 1024 * 1024) { if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin)
    throw new Error('Cross-origin request rejected.'); if (Number(req.headers.get('content-length') || 0) > max)
    throw new Error('Request too large.'); const text = await req.text(); if (text.length > max)
    throw new Error('Request too large.'); return JSON.parse(text); }
