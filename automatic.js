import { analyze } from './engine.js';
import { discoverSources } from './web.js';
import { emptyAI } from './ai-types.js';
export async function automaticAnalysis(text, cached, options = {}, fetcher = fetch) { const fresh = await discoverSources(text, fetcher); const sources = fresh.sources.length ? fresh.sources : cached.slice(0, 12); fresh.web.cachedSources = fresh.sources.length ? 0 : sources.length; if (fresh.web.cachedSources)
    fresh.web.message += ' Compared cached public pages instead; they may be unrelated or outdated.'; const report = analyze(text, sources, options); return { ...report, ai: emptyAI('The local AI check runs separately from source matching.', 'pending'), web: fresh.web, sources: sources.map(({ id, name, url, retrieved, text }) => ({ id, name, url, retrieved, text: text.slice(0, 65000) })), freshSources: fresh.sources, date: new Date().toISOString() }; }
