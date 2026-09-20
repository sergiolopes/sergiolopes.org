import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
    && !Number.isNaN(new Date(value).getTime());
}

function dateValue(value) {
  return validDate(value) ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : null;
}

function mergeEntries(root) {
  const dataRoot = path.join(root, 'src', 'data');
  const archive = readJson(path.join(dataRoot, 'archive.json'), []);
  const recovered = readJson(path.join(dataRoot, 'posts-recovered.json'), []);
  const additions = readJson(path.join(dataRoot, 'podcasts-new.json'), []);
  const mirrors = readJson(path.join(dataRoot, 'mirrors.json'), {});
  const bySlug = new Map();

  for (const entry of [...archive, ...recovered, ...additions]) {
    if (!entry?.slug || bySlug.has(entry.slug)) continue;
    bySlug.set(entry.slug, { ...entry, ...(mirrors[entry.slug] || {}), slug: entry.slug });
  }

  return [...bySlug.values()].sort((a, b) => {
    const dateSort = String(b.date || '').localeCompare(String(a.date || ''));
    return dateSort || String(a.slug).localeCompare(String(b.slug));
  });
}

function talkYears(root) {
  const dataRoot = path.join(root, 'src', 'data');
  const history = readJson(path.join(dataRoot, 'talks-history.json'), []);
  const additions = readJson(path.join(dataRoot, 'talks-new.json'), []);
  return [...new Set([...history, ...additions]
    .map((entry) => Number(entry?.year))
    .filter((year) => Number.isInteger(year) && year > 0))]
    .sort((a, b) => b - a);
}

function hasLocalSnapshot(entry) {
  const html = String(entry.html || entry.mirrorHtml || entry.snapshotHtml || '').trim();
  return Boolean(html)
    && !/Este registro preserva a participa(?:ç|c)ão publicada originalmente/i.test(html)
    && !/Registro preservado no arquivo\.\s*<a/i.test(html);
}

function siteOrigin() {
  const site = (process.env.SITE_URL || 'https://sergiolopes.github.io').replace(/\/+$/, '');
  const configuredBase = process.env.SITE_BASE || '/sergiolopes.org';
  const base = `/${configuredBase.replace(/^\/+|\/+$/g, '')}`;
  return `${site}${base}`;
}

function absoluteUrl(origin, route) {
  const clean = route.replace(/^\/+/, '');
  return clean ? `${origin}/${clean}` : `${origin}/`;
}

function feedAbsoluteUrl(raw, origin) {
  const value = String(raw || '');
  if (!value.startsWith('/') || value.startsWith('//')) return value;
  const parsedOrigin = new URL(`${origin}/`);
  const basePath = parsedOrigin.pathname.replace(/\/+$/, '');
  if (basePath && (value === basePath || value.startsWith(`${basePath}/`))) {
    return `${parsedOrigin.origin}${value}`;
  }
  return `${origin}${value}`;
}

function absolutizeFeedHtml(html, origin) {
  let sample = null;
  const remember = (raw, resolved) => {
    if (!sample && raw !== resolved) sample = { raw, resolved };
  };
  let output = String(html || '').replace(
    /\b(href|src|poster|action|data-src)=(['"])(.*?)\2/gi,
    (match, attribute, quote, raw) => {
      const resolved = feedAbsoluteUrl(raw, origin);
      remember(raw, resolved);
      return `${attribute}=${quote}${resolved}${quote}`;
    },
  );
  output = output.replace(/\b(srcset|imagesrcset)=(['"])(.*?)\2/gi, (match, attribute, quote, raw) => {
    const values = raw.split(',').map((candidate) => {
      const parts = candidate.trim().split(/\s+/);
      if (!parts[0]) return candidate;
      const resolved = feedAbsoluteUrl(parts[0], origin);
      remember(parts[0], resolved);
      parts[0] = resolved;
      return parts.join(' ');
    });
    return `${attribute}=${quote}${values.join(', ')}${quote}`;
  });
  return { html: output, sample };
}

function normalizeXmlLineEndings(value) {
  return value.replace(/[ \t]+(?=\r?\n)/g, '');
}

function yearOf(entry) {
  const match = String(entry.date || '').match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function sitemapRoutes(entries, root) {
  const routes = new Set([
    '',
    'artigos',
    'podcasts',
    'palestras',
    'livros',
    'sobre',
    'externos',
    'arquivo',
    // This is a real static page kept in public/ by the migration.
    'livro-web-mobile',
    'quadro',
  ]);
  const years = [...new Set(entries.map(yearOf).filter(Boolean))].sort((a, b) => b - a);
  const articleYears = [...new Set(entries
    .filter((entry) => entry.kind === 'article' || (entry.kind === 'external' && hasLocalSnapshot(entry)))
    .map(yearOf)
    .filter(Boolean))].sort((a, b) => b - a);
  const podcastYears = [...new Set(entries
    .filter((entry) => entry.kind === 'podcast')
    .map(yearOf)
    .filter(Boolean))].sort((a, b) => b - a);
  const presentationYears = talkYears(root);

  for (const year of years) routes.add(`arquivo/ano/${year}`);
  for (const year of articleYears) routes.add(`artigos/ano/${year}`);
  for (const year of podcastYears) routes.add(`podcasts/ano/${year}`);
  for (const year of presentationYears) routes.add(`palestras/ano/${year}`);
  for (const entry of entries) routes.add(encodeURIComponent(entry.slug));
  return [...routes];
}

function writeFeed(publicRoot, origin, entries) {
  const dated = entries.filter((entry) => validDate(entry.date));
  const latest = dateValue(dated[0]?.date)?.toISOString() || new Date(0).toISOString();
  let sample = null;
  const atomEntries = entries.map((entry) => {
    const url = absoluteUrl(origin, encodeURIComponent(entry.slug) + '/');
    const updated = dateValue(entry.date)?.toISOString() || latest;
    const warning = entry.feedWarning ? `<p class="feed-warning">${escapeXml(entry.feedWarning)}</p>` : '';
    const sourceContent = String(entry.html || '').trim()
      ? `${warning}${entry.html}`
      : `${warning}<p>Registro preservado no arquivo. <a href="${escapeXml(entry.originalUrl || url)}">Abrir referência</a>.</p>`;
    const feedContent = absolutizeFeedHtml(sourceContent, origin);
    if (!sample && feedContent.sample) sample = feedContent.sample;
    const content = normalizeXmlLineEndings(escapeXml(feedContent.html));
    return [
      '  <entry>',
      `    <title>${escapeXml(entry.title || entry.slug)}</title>`,
      `    <link href="${escapeXml(url)}"/>`,
      `    <updated>${updated}</updated>`,
      `    <id>${escapeXml(url)}</id>`,
      `    <content type="html">${escapeXml(content)}</content>`,
      '  </entry>',
    ].join('\n');
  }).join('\n');
  const feedUrl = absoluteUrl(origin, 'feed.xml');
  const atom = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    '  <title>Sérgio Lopes — arquivo</title>',
    `  <link href="${escapeXml(feedUrl)}" rel="self"/>`,
    `  <link href="${escapeXml(`${origin}/`)}"/>`,
    `  <updated>${latest}</updated>`,
    `  <id>${escapeXml(`${origin}/`)}</id>`,
    '  <author><name>Sérgio Lopes</name></author>',
    atomEntries,
    '</feed>',
    '',
  ].join('\n');
  if (sample && !atom.includes(escapeXml(sample.resolved))) {
    throw new Error(`Atom feed sample link was not resolved: ${sample.raw}`);
  }
  fs.writeFileSync(path.join(publicRoot, 'feed.xml'), atom);
  // Keep the conventional Atom path for readers that used it historically.
  fs.writeFileSync(path.join(publicRoot, 'atom.xml'), atom);
}

function writeSitemap(publicRoot, origin, entries) {
  const routes = sitemapRoutes(entries, path.dirname(publicRoot));
  const urls = routes.map((route) => absoluteUrl(origin, route ? `${route}/` : ''));
  const lastmodByRoute = new Map(entries.map((entry) => [encodeURIComponent(entry.slug), entry.date]));
  const nodes = routes.map((route, index) => {
    const lastmod = dateValue(lastmodByRoute.get(route));
    return [
      '  <url>',
      `    <loc>${escapeXml(urls[index])}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>`] : []),
      '  </url>',
    ].join('\n');
  }).join('\n');
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    nodes,
    '</urlset>',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(publicRoot, 'sitemap.xml'), xml);
  fs.writeFileSync(path.join(publicRoot, 'sitemap.txt'), `${urls.join('\n')}\n`);
  fs.writeFileSync(path.join(publicRoot, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${absoluteUrl(origin, 'sitemap.xml')}\n`);
  return { routes, urls };
}

export function generateSiteIndexes({ targetRoot = defaultRoot } = {}) {
  const entries = mergeEntries(targetRoot);
  const publicRoot = path.join(targetRoot, 'public');
  fs.mkdirSync(publicRoot, { recursive: true });
  const origin = siteOrigin();
  writeFeed(publicRoot, origin, entries);
  const sitemap = writeSitemap(publicRoot, origin, entries);
  return { origin, entries, routes: sitemap.routes };
}

const invokedFile = process.argv[1] && path.resolve(process.argv[1]);
if (invokedFile === fileURLToPath(import.meta.url)) {
  const result = generateSiteIndexes();
  const counts = result.entries.reduce((summary, entry) => {
    summary[entry.kind] = (summary[entry.kind] || 0) + 1;
    return summary;
  }, {});
  console.log(JSON.stringify({ origin: result.origin, entries: result.entries.length, counts, sitemapRoutes: result.routes.length }, null, 2));
}
