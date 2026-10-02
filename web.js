import { tokenize } from './engine.js';
function privateIPv4(host) { const parts = host.split('.').map(Number); if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255))
    return false; const [a, b] = parts; return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19); }
function privateIPv6(host) { const h = host.replace(/^\[|\]$/g, '').toLowerCase(); return h === '::1' || h === '::' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('::ffff:127.') || h.startsWith('::ffff:10.') || h.startsWith('::ffff:192.168.'); }
function privateHost(hostname) { const host = hostname.replace(/\.$/, '').toLowerCase(); return !host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.test') || privateIPv4(host) || host.includes(':') && privateIPv6(host); }
export function safePublicURL(value) { try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || (u.port && !['80', '443'].includes(u.port)) || privateHost(u.hostname))
        return null;
    u.protocol = 'https:';
    u.hash = '';
    return u.href;
}
catch {
    return null;
} }
export function decodeHTML(text) { return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => { const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : parseInt(n, 10); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' '; }).replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' '); }
export function plainText(html) { return decodeHTML(html.replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(?:p|div|h[1-6]|li|section|article)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim(); }
const webStop = new Set('a an the this that these those is are was were be been being to of and or in on at for by with as from it its we our they their he she his her but not can could will would should may might have has had do does did into than then also about using use used through during before after across among because while where when which who whose each such more most less very between within without'.split(' '));
export function searchQueries(text) {
    const ts = tokenize(text);
    if (ts.length < 20)
        return [];
    const windows = [];
    const size = Math.min(18, Math.max(12, Math.floor(ts.length / 18)));
    for (let i = 0; i + size <= ts.length; i += Math.max(6, Math.floor(size / 2))) {
        const words = ts.slice(i, i + size).map(t => t.value), content = words.filter(w => w.length > 3 && !webStop.has(w)), unique = new Set(content);
        const avg = content.reduce((n, w) => n + w.length, 0) / Math.max(1, content.length);
        windows.push({ offset: i, score: unique.size * 2 + avg + content.filter(w => /\d/.test(w) || w.length > 8).length * 1.5 });
    }
    const anchors = [0, Math.floor(ts.length * .2), Math.floor(ts.length * .4), Math.floor(ts.length * .6), Math.floor(ts.length * .8)].filter(i => i + size <= ts.length).map(offset => ({ offset, score: 99 }));
    const phraseQueries = [...anchors, ...windows.sort((a, b) => b.score - a.score)].sort((a, b) => b.score - a.score).map(w => '"' + ts.slice(w.offset, w.offset + size).map(t => t.value).join(' ') + '"');
    const keywords = [...new Set(ts.map(t => t.value).filter(w => w.length > 4 && !webStop.has(w)))].sort((a, b) => b.length - a.length).slice(0, 10).join(' ');
    return [...new Set([...phraseQueries.slice(0, 8), keywords].filter(Boolean))];
}
async function readLimited(r, limit = 1000000) { const reader = r.body?.getReader(); if (!reader)
    throw new Error('No response body'); let total = 0; const parts = []; try {
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        total += value.length;
        if (total > limit)
            throw new Error('Page too large');
        parts.push(value);
    }
}
finally {
    await reader.cancel().catch(() => { });
} const bytes = new Uint8Array(total); let p = 0; for (const a of parts) {
    bytes.set(a, p);
    p += a.length;
} return new TextDecoder().decode(bytes); }
export async function getPage(url, fetcher = fetch, search = false) { let current = url; for (let redirect = 0; redirect < 4; redirect++) {
    if (!search && !safePublicURL(current))
        throw new Error('Unsupported source host');
    const r = await fetcher(current, { redirect: 'manual', signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'VeritasSourceReview/1.0', 'Accept': 'text/html,text/plain;q=0.9' } });
    if (r.status >= 300 && r.status < 400) {
        if (!search)
            throw new Error('Source redirects require separate permission checks');
        const next = r.headers.get('location');
        if (!next)
            throw new Error('Missing redirect');
        const target = new URL(next, current);
        if (search && target.hostname !== new URL(url).hostname)
            throw new Error('Search redirect not allowed');
        current = target.href;
        continue;
    }
    if (!r.ok || r.status === 202)
        throw new Error('Source blocked or unavailable');
    if (!/text\/(?:html|plain)|application\/xhtml/.test(r.headers.get('content-type') || ''))
        throw new Error('Unsupported source format');
    const text = await readLimited(r);
    if (/anomaly\.js|anomaly-modal|captcha|challenge-platform|verify you are human/i.test(text))
        throw new Error('Source requires verification');
    return { text, url: current };
} throw new Error('Too many redirects'); }
export function robotsAllows(body, path) {
    const groups = [];
    let group = { agents: [], rules: [] };
    for (const raw of body.split(/\r?\n/)) {
        const line = raw.split('#')[0].trim(), colon = line.indexOf(':');
        if (colon < 0)
            continue;
        const name = line.slice(0, colon).toLowerCase(), value = line.slice(colon + 1).trim();
        if (name === 'user-agent') {
            if (group.rules.length) {
                groups.push(group);
                group = { agents: [], rules: [] };
            }
            group.agents.push(value.toLowerCase());
        }
        else if (['allow', 'disallow'].includes(name) && value)
            group.rules.push({ allow: name === 'allow', pattern: value });
    }
    groups.push(group);
    const specific = groups.filter(g => g.agents.some(a => a !== '*' && 'veritassourcereview'.includes(a)));
    const selected = specific.length ? specific : groups.filter(g => g.agents.includes('*'));
    const matches = selected.flatMap(g => g.rules).filter(r => { const end = r.pattern.endsWith('$'); const raw = end ? r.pattern.slice(0, -1) : r.pattern; const pattern = raw.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'); return new RegExp('^' + pattern + (end ? '$' : '')).test(path); }).sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow));
    return !matches.length || matches[0].allow;
}
export function resultLinks(html, base) { const urls = []; for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
        let u = new URL(decodeHTML(m[1]), base);
        const target = u.searchParams.get('uddg');
        if (target)
            u = new URL(target);
        const safe = safePublicURL(u.href);
        if (safe && !/\.(?:jpg|jpeg|png|gif|webp|svg|zip|rar|7z|mp4|mp3|docx?|xlsx?|pptx?)(?:[?#]|$)/i.test(safe) && !/\/wiki\/(?:Special|Help|File|Category|Wikipedia|Template|Portal|Talk):|[?&](?:action|oldid)=|\/w\/index.php/.test(safe) && !safe.endsWith('/wiki/Main_Page') && !urls.includes(safe))
            urls.push(safe);
    }
    catch { }
} return urls; }
export async function discoverSources(text, fetcher = fetch) {
    const queries = searchQueries(text);
    const web = { status: 'unavailable', queries: 0, attemptedQueries: queries.length, pagesFetched: 0, pagesSkipped: 0, cachedSources: 0, message: '' };
    const urls = new Set();
    // Public search pages only; no paid detector or search API. Blocked pages are not bypassed.
    for (let i = 0; i < queries.length; i += 2) {
        await Promise.all(queries.slice(i, i + 2).map(async (q) => { try {
            const page = await getPage('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), fetcher, true);
            web.queries++;
            resultLinks(page.text, page.url).slice(0, 3).forEach(u => urls.add(u));
        }
        catch { } }));
    }
    if (!urls.size) {
        try {
            const terms = tokenize(text).filter(t => t.value.length > 4).slice(0, 8).map(t => t.value).join(' ');
            const page = await getPage('https://en.wikipedia.org/w/index.php?search=' + encodeURIComponent(terms), fetcher, true);
            web.attemptedQueries++;
            web.queries++;
            const title = decodeHTML(page.text.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
            if (!/search results|special:search/i.test(title) && page.url.includes('/wiki/'))
                urls.add(page.url);
            else
                resultLinks(page.text.includes('mw-search-results') ? page.text.slice(page.text.indexOf('mw-search-results')) : '', page.url).filter(u => u.includes('/wiki/')).slice(0, 4).forEach(u => urls.add(u));
        }
        catch { }
    }
    const sources = [];
    const robots = new Map();
    const candidates = [...urls].slice(0, 12);
    for (let i = 0; i < candidates.length; i += 3)
        await Promise.all(candidates.slice(i, i + 3).map(async (url) => { try {
            const u = new URL(url);
            let rules = robots.get(u.origin);
            if (rules === undefined) {
                try {
                    const r = await fetcher(u.origin + '/robots.txt', { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'VeritasSourceReview/1.0' } });
                    rules = r.status === 404 ? '' : r.ok ? await readLimited(r, 500000) : null;
                }
                catch {
                    rules = null;
                }
                robots.set(u.origin, rules);
            }
            if (rules === null || !robotsAllows(rules, u.pathname + u.search))
                throw new Error('Crawling not permitted');
            const page = await getPage(url, fetcher);
            const main = page.text.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || page.text.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || page.text;
            const body = plainText(main).slice(0, 65000);
            if (tokenize(body).length < 30)
                throw new Error('Insufficient readable content');
            sources.push({ id: page.url, url: page.url, name: plainText(page.text.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || u.hostname), text: body, kind: 'web', retrieved: new Date().toISOString() });
            web.pagesFetched++;
        }
        catch {
            web.pagesSkipped++;
        } }));
    web.status = web.pagesFetched > 0 ? 'partial' : 'unavailable';
    web.message = web.pagesFetched ? 'Public-web check completed with limited coverage. Distinctive phrases were searched, readable public pages were fetched, and the uploaded document was compared with those pages. This is still not an exhaustive internet, private database, or paid-journal scan.' : 'No readable public sources were obtained. Web access may be blocked, the document may not be indexed online, or supported results were not readable. Veritas will rely on local-only evidence.';
    return { sources, web };
}
