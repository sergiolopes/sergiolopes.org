import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownToHtml } from 'satteri';
import { generateSiteIndexes } from './generate-site-indexes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const targetRoot = path.resolve(here, '..');
const sourceRoot = path.resolve(targetRoot, '..', 'blog-source');
const sourceSrc = path.join(sourceRoot, 'src');
const postsRoot = path.join(sourceSrc, 'posts');
const dataRoot = path.join(targetRoot, 'src', 'data');

const postExtensions = ['.md', '.eco', '.html'];

function walk(dir) {
  const result = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) result.push(...walk(full));
    else if (postExtensions.some((extension) => full.endsWith(extension))) result.push(full);
  }
  return result.sort();
}

function parseScalar(raw) {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

// The old DocPad source contains a duplicate category and a few unquoted
// descriptions containing punctuation that strict YAML rejects. Its metadata
// is deliberately simple, so this tolerant parser retains the last value just
// as DocPad did instead of dropping an otherwise valid post.
function parseFrontmatter(source) {
  const trimmed = source.replace(/^\uFEFF/, '').trimStart();
  if (!trimmed.startsWith('---')) return { meta: {}, body: source };
  const firstLineEnd = trimmed.indexOf('\n');
  const end = trimmed.indexOf('\n---', firstLineEnd + 1);
  if (firstLineEnd < 0 || end < 0) return { meta: {}, body: source };
  const meta = {};
  for (const line of trimmed.slice(firstLineEnd + 1, end).split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][\w-]*):\s?(.*)$/);
    if (match) meta[match[1]] = parseScalar(match[2]);
  }
  const body = trimmed.slice(end + '\n---'.length).replace(/^\r?\n/, '');
  return { meta, body };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function dedent(value) {
  const lines = value.replace(/^\r?\n/, '').replace(/\r?\n\s*$/, '').split(/\r?\n/);
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length);
  const amount = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(amount)).join('\n');
}

function codeBlock(language, code) {
  const normalized = dedent(code);
  return `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(normalized)}\n</code></pre>`;
}

function transformEco(body, absolutePath) {
  let result = body;

  // These helpers were render-time DocPad conveniences. Keeping their output
  // makes old posts useful as static pages while removing the old runtime.
  result = result.replace(/<%-\s*@youtube\(\s*(['"])([^'"\n]+)\1(?:\s*,\s*(['"])([^'"\n]*)\3)?\s*\)\s*%>/g, (_match, _quote, id, _captionQuote, caption) => {
    const figcaption = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';
    return `<figure class="legacy-embed"><div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0" title="Vídeo do YouTube" loading="lazy" allowfullscreen></iframe></div>${figcaption}</figure>`;
  });
  result = result.replace(/<%-\s*@slideshare\(\s*(['"])([^'"\n]+)\1(?:\s*,\s*(['"])([^'"\n]*)\3)?\s*\)\s*%>/g, (_match, _quote, id, _captionQuote, caption) => {
    const figcaption = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';
    return `<figure class="legacy-embed"><div class="video-wrapper"><iframe src="https://www.slideshare.net/slideshow/embed_code/${encodeURIComponent(id)}" title="Apresentação no SlideShare" loading="lazy" allowfullscreen></iframe></div>${figcaption}</figure>`;
  });
  result = result.replace(/<%-\s*@tweetable\(\s*(['"])([\s\S]*?)\1\s*\)\s*%>/g, (_match, _quote, text) => `<blockquote class="tweetable">${escapeHtml(text)}</blockquote>`);

  // @code blocks are paired with a literal <% end %> in the source. Match
  // these before removing generic Eco tags so snippets remain readable.
  result = result.replace(/<%-\s*@code\s+(['"])([^'"\n]+)\1\s*,\s*->\s*%>([\s\S]*?)<%\s*end\s*%>/g, (_match, _quote, language, code) => codeBlock(language, code));

  result = result.replace(/<%-\s*@partial\(\s*(['"])([^'"\n]+)\1\s*\)\s*%>/g, (_match, _quote, partial) => {
    const partialPath = path.join(sourceSrc, 'partials', partial);
    return fs.existsSync(partialPath) ? fs.readFileSync(partialPath, 'utf8') : `<!-- legacy partial omitted: ${escapeHtml(partial)} -->`;
  });
  result = result.replace(/<%-\s*@include\(\s*(['"])([^'"\n]+)\1\s*\)\s*%>/g, (_match, _quote, include) => {
    const includePath = path.join(sourceSrc, 'files', include);
    if (include.endsWith('.svg') && fs.existsSync(includePath)) return fs.readFileSync(includePath, 'utf8');
    return `<img src="/${include.replace(/^\/+/, '')}" alt="" loading="lazy">`;
  });

  // Drop control tags and Eco comments that have no static representation.
  result = result.replace(/<%#[\s\S]*?%>/g, '');
  result = result.replace(/<%[=-]?[\s\S]*?%>/g, '');
  return result;
}

async function renderBody(body, filePath) {
  const transformed = transformEco(body, filePath);
  const isMarkdown = filePath.includes('.md');
  if (!isMarkdown) return transformed;
  const rendered = await markdownToHtml(transformed);
  return rendered.html;
}

function postSlug(filePath, meta) {
  const relative = path.relative(postsRoot, filePath).replaceAll(path.sep, '/');
  // DocPad's post URL is derived from the filename. The frontmatter `slug`
  // field was used by the old presentation asset paths, not the public URL;
  // existing internal links confirm the filename-derived routes.
  return path.posix.basename(relative).replace(/\.html\.md\.eco$|\.html\.md$|\.html\.eco$|\.html$|\.md$|\.eco$/i, '');
}

function kindFor(relative, meta) {
  if (relative.startsWith('podcasts/')) return 'podcast';
  if (relative.startsWith('caelum/') || relative.startsWith('externo/')) return 'external';
  if (meta.layout === 'presentation' || String(meta.category || '').split(/\s+/).includes('palestra')) return 'talk';
  return 'article';
}

function plainText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function buildArchive() {
  const entries = [];
  for (const filePath of walk(postsRoot)) {
    const relative = path.relative(postsRoot, filePath).replaceAll(path.sep, '/');
    const source = fs.readFileSync(filePath, 'utf8');
    const { meta, body } = parseFrontmatter(source);
    const slug = postSlug(filePath, meta);
    const kind = kindFor(relative, meta);
    const html = await renderBody(body, filePath);
    const originalUrl = meta.originalURI || undefined;
    const description = meta.description || plainText(html).slice(0, 220);
    const entry = {
      slug,
      title: meta.title || slug,
      date: meta.date || null,
      kind,
      category: meta.category || (kind === 'podcast' ? 'podcast' : kind === 'talk' ? 'palestra' : 'blog'),
      description,
      html: kind === 'external' && !html.trim() ? `<p>Este registro preserva a participação publicada originalmente em outro site.</p>` : html,
      ...(originalUrl ? { originalUrl } : {}),
      sourcePath: `src/posts/${relative}`,
    };
    if (meta.originalDate) entry.originalDate = meta.originalDate;
    if (meta.css) entry.legacyCss = meta.css;
    if (meta.script) entry.legacyScript = meta.script;
    if (meta.fullPagePost === true || meta.fullPagePost === 'true') entry.fullPage = true;
    if (meta.feedWarning) entry.feedWarning = meta.feedWarning;
    entries.push(entry);
  }
  entries.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || a.slug.localeCompare(b.slug));
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'archive.json'), `${JSON.stringify(entries, null, 2)}\n`);
  return entries;
}

function writeStaticRedirect(relativePath, destination, title = 'Redirecionando…') {
  const destinationAttribute = escapeHtml(destination);
  const html = `<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8">\n  <meta http-equiv="refresh" content="0; url=${destinationAttribute}">\n  <meta name="robots" content="noindex">\n  <title>${escapeHtml(title)}</title>\n</head>\n<body>\n  <p><a href="${destinationAttribute}">${destinationAttribute}</a></p>\n  <script>location.replace(${JSON.stringify(destination)});</script>\n</body>\n</html>\n`;
  const output = path.join(targetRoot, 'public', relativePath, 'index.html');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html);
}

function buildLegacyRedirects() {
  const oldExamples = [
    ['m0', 'livro-web-mobile/exemplos/grid-flexivel-simples.html'], ['mo', 'livro-web-mobile/exemplos/grid-flexivel-simples.html'],
    ['m1', 'livro-web-mobile/exemplos/media-queries1.html'], ['m2', 'livro-web-mobile/exemplos/media-queries2.html'],
    ['m3', 'livro-web-mobile/exemplos/viewport.html'], ['m4', 'livro-web-mobile/exemplos/viewport-mobile.html'],
    ['m5', 'livro-web-mobile/exemplos/retina.html'], ['m6', 'livro-web-mobile/exemplos/touch-start-end.html'],
    ['m7', 'livro-web-mobile/exemplos/touch-smart.html'], ['m8', 'livro-web-mobile/exemplos/touch-slide.html'],
    ['m9', 'livro-web-mobile/exemplos/input-html5.html'], ['m10', 'livro-web-mobile/exemplos/input-date.html'],
    ['m11', 'livro-web-mobile/exemplos/input-number.html'], ['m12', 'livro-web-mobile/exemplos/input-range-color.html'],
    ['m13', 'livro-web-mobile/exemplos/input-password.html'], ['m14', 'livro-web-mobile/exemplos/select.html'],
    ['m15', 'livro-web-mobile/exemplos/input-file.html'], ['m16', 'livro-web-mobile/exemplos/labels.html'],
    ['e0', 'mobile-web-book/examples/grid-flexivel-simples.html'], ['eo', 'mobile-web-book/examples/grid-flexivel-simples.html'],
    ['e1', 'mobile-web-book/examples/media-queries1.html'], ['e2', 'mobile-web-book/examples/media-queries2.html'],
    ['e3', 'mobile-web-book/examples/viewport.html'], ['e4', 'mobile-web-book/examples/viewport-mobile.html'],
    ['e5', 'mobile-web-book/examples/retina.html'], ['e6', 'mobile-web-book/examples/touch-start-end.html'],
    ['e7', 'mobile-web-book/examples/touch-smart.html'], ['e8', 'mobile-web-book/examples/touch-slide.html'],
    ['e9', 'mobile-web-book/examples/input-html5.html'], ['e10', 'mobile-web-book/examples/input-date.html'],
    ['e11', 'mobile-web-book/examples/input-number.html'], ['e12', 'mobile-web-book/examples/input-range-color.html'],
    ['e13', 'mobile-web-book/examples/input-password.html'], ['e14', 'mobile-web-book/examples/select.html'],
    ['e15', 'mobile-web-book/examples/input-file.html'], ['e16', 'mobile-web-book/examples/labels.html'],
  ];
  for (const [name, destination] of oldExamples) writeStaticRedirect(name, `../${destination}`, `Exemplo ${name}`);
  writeStaticRedirect('mobile-web-book', 'https://www.codecrushing.com/products/book-mobile-web-responsive', 'A Web Mobile');
}

function writeFeeds(entries) {
  /*
  // Keep the historical feed and sitemap paths available while the new site
  // remains on its GitHub Pages project URL. The canonical origin can move to
  // the custom domain later without changing any entry URLs.
  const origin = 'https://sergiolopes.github.io/sergiolopes.org';
  const additionalPath = path.join(dataRoot, 'podcasts-new.json');
  const mirrorPath = path.join(dataRoot, 'mirrors.json');
  const additional = fs.existsSync(additionalPath) ? JSON.parse(fs.readFileSync(additionalPath, 'utf8')) : [];
  const mirrorMap = fs.existsSync(mirrorPath) ? JSON.parse(fs.readFileSync(mirrorPath, 'utf8')) : {};
  const feedEntries = [
    ...entries.map((entry) => ({ ...entry, ...(mirrorMap[entry.slug] || {}) })),
    ...additional.filter((entry) => !entries.some((existing) => existing.slug === entry.slug)),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || a.slug.localeCompare(b.slug));
  const dated = feedEntries.filter((entry) => entry.date && /^\d{4}-\d{2}-\d{2}/.test(entry.date));
  const latest = dated[0]?.date && !Number.isNaN(new Date(dated[0].date).getTime())
    ? new Date(dated[0].date).toISOString()
    : new Date(0).toISOString();
  const atomEntries = feedEntries.map((entry) => {
    const url = `${origin}/${encodeURIComponent(entry.slug)}/`;
    const updated = entry.date && !Number.isNaN(new Date(entry.date).getTime())
      ? new Date(entry.date).toISOString()
      : latest;
    const warning = entry.feedWarning ? `<p class="feed-warning">${escapeXml(entry.feedWarning)}</p>` : '';
    const content = entry.html?.trim()
      ? `${warning}${entry.html}`
      : `${warning}<p>Registro preservado no arquivo. <a href="${escapeXml(entry.originalUrl || url)}">Abrir referência</a>.</p>`;
    return `  <entry>\n    <title>${escapeXml(entry.title)}</title>\n    <link href="${escapeXml(url)}"/>\n    <updated>${updated}</updated>\n    <id>${escapeXml(url)}</id>\n    <content type="html">${escapeXml(content)}</content>\n  </entry>`;
  }).join('\n');
  const atom = `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <title>Sérgio Lopes — arquivo</title>\n  <link href="${origin}/feed.xml" rel="self"/>\n  <link href="${origin}/"/>\n  <updated>${latest}</updated>\n  <id>${origin}/</id>\n  <author><name>Sérgio Lopes</name></author>\n${atomEntries}\n</feed>\n`;
  const publicRoot = path.join(targetRoot, 'public');
  fs.mkdirSync(publicRoot, { recursive: true });
  fs.writeFileSync(path.join(publicRoot, 'feed.xml'), atom);
  // A few old readers used the conventional Atom path even though DocPad
  // emitted feed.xml. Keep both routes as static equivalents.
  fs.writeFileSync(path.join(publicRoot, 'atom.xml'), atom);

  const urls = [`${origin}/`, ...feedEntries.map((entry) => `${origin}/${encodeURIComponent(entry.slug)}/`)];
  fs.writeFileSync(path.join(publicRoot, 'sitemap.txt'), `${urls.join('\n')}\n`);
  const urlNodes = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n');
  fs.writeFileSync(path.join(publicRoot, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlNodes}\n</urlset>\n`);
  fs.writeFileSync(path.join(publicRoot, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
  */
}

function copyLegacyAssets() {
  const publicRoot = path.join(targetRoot, 'public');
  fs.mkdirSync(publicRoot, { recursive: true });
  // Keep demos, images, fonts, audio, manifests, and HTML resources. Apache
  // directives and the old live PHP endpoint are intentionally excluded.
  fs.cpSync(path.join(sourceSrc, 'files'), publicRoot, {
    recursive: true,
    filter: (source) => !source.endsWith('.htaccess') && !source.endsWith('.php') && path.basename(source) !== 'IcoMoon Session.json',
  });
  const privateFontSession = path.join(publicRoot, 'fonts', 'IcoMoon Session.json');
  if (fs.existsSync(privateFontSession)) fs.rmSync(privateFontSession);

  // The old build emitted these runtime scripts under /script. Preserve the
  // useful presentation/demo code while removing analytics and third-party
  // tracking hooks from the copied legacy files.
  const scriptsSource = path.join(sourceSrc, 'documents', 'script');
  const scriptsTarget = path.join(publicRoot, 'script');
  fs.cpSync(scriptsSource, scriptsTarget, { recursive: true });
  const scrub = [
    path.join(scriptsTarget, 'scripts.js'),
    path.join(scriptsTarget, 'presentation.js'),
    path.join(scriptsTarget, 'posts', 'responsive-design.js'),
    path.join(scriptsTarget, 'palestra', 'mobile-web.js'),
    path.join(publicRoot, 'livro-web-mobile', 'exemplos', 'script.js'),
    path.join(publicRoot, 'mobile-web-book', 'examples', 'script.js'),
    path.join(publicRoot, 'livro-web-mobile', 'referencias.html'),
    path.join(publicRoot, 'resources', 'palestra-retina', 'iconfonts.html'),
  ];
  for (const file of scrub) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');
    content = content
      .replace(/\/\/ analytics[\s\S]*?(?=\/\/ load twitter|$)/i, '/* analytics removed during archive migration */\n')
      .replace(/\/\/ loads analytics[\s\S]*?(?=\/\/ helper|$)/i, '/* analytics removed during archive migration */\n')
      .replace(/\/\/ analytics: track external links[\s\S]*?(?=\/\/ load twitter|$)/i, '')
      .replace(/Q\(window\)\.on\('showslide',[\s\S]*?\n\}\);\n/i, '')
      .replace(/https?:\/\/www\.google-analytics\.com\/[^"]+/gi, '')
      .replace(/UA-61051-6/g, 'ARCHIVE_ANALYTICS_REMOVED')
      .replace(/<script[^>]*>[\s\S]*?google-analytics[\s\S]*?<\/script>/gi, '<!-- analytics removed during archive migration -->')
      // Keep the historical presentation controller, but never reconnect to
      // the defunct public WebSocket service from a static page.
      .replace(/^\s*WS\.connect\("ws:\/\/sergiolopes\.no-ip\.biz:[^;]+;\s*$/gm, '\n    // live presentation sync disabled in the static archive\n')
      // QR generation used an external image endpoint in every book demo.
      // The examples remain usable without leaking the visitor path.
      .replace(/^\s*document\.getElementById\(['\"]qrcode['\"]\)\.innerHTML\s*=.*$/gm, '// external QR image generation removed from the static archive')
      // Do not load the Twitter widget automatically from archived content.
      .replace(/!function\(d,s,id\)\{[\s\S]*?\}\(document,\"script\",\"twitter-wjs\"\);/g, '/* social widget loading removed from the static archive */')
      // The old geolocation slide used JSONP against Nominatim. Preserve the
      // permission interaction while avoiding third-party script injection.
      .replace(/\s*\/\/ jsonp openstreetmap[\s\S]*?document\.head\.appendChild\(script\)/g, '\n                        Q(el).find(\'.aviso\').get().innerHTML = "Mapa externo desativado no arquivo estático.";')
      .replace(/\n\s*\/\/ call bitly[\s\S]*?document\.head\.appendChild\(s\);/i, '\n\t// The historical Bitly endpoint and API key were removed from this static archive.');
    if (file.endsWith(path.join('livro-web-mobile', 'referencias.html'))) {
      content = content.replaceAll('href="/livro-web-mobile/"', 'href="./"');
    }
    if (file.endsWith(path.join('resources', 'palestra-retina', 'iconfonts.html'))) {
      content = content.replaceAll('href="/palestra-retina-web/"', 'href="../../palestra-retina-web/"');
    }
    if (file.endsWith(path.join('script', 'posts', 'responsive-design.js'))) {
      // The historical demo iframe mixed HTTP into the HTTPS archive and now
      // redirects to a different Alura page. Keep the responsive interaction
      // with a visible local note and a safe link to that current destination.
      content = content
        .replaceAll('http://www.youtube.com/embed/', 'https://www.youtube.com/embed/')
        .replace(/var iframe = document\.createElement\('iframe'\);[\s\S]*?wrapper\.appendChild\(iframe\);/, `var iframe = document.createElement('div');
\tiframe.className = 'archive-demo-note';
\tiframe.style.minHeight = '8rem';
\tiframe.innerHTML = 'O demo histórico do site Arquitetura Java foi substituído. <a href="https://www.alura.com.br/especial/arquitetura-java" target="_blank" rel="external noopener">Ver o destino atual ↗</a>';
\twrapper.appendChild(iframe);`);
    }
    fs.writeFileSync(file, content);
  }

  // The book landing page lived under documents/ rather than files/. Keep
  // that historical URL alongside its examples and artwork as a self
  // contained static page. Root-relative links are made relative to the
  // project base so it works on GitHub Pages and on the future custom domain.
  const bookSource = fs.readFileSync(path.join(sourceSrc, 'documents', 'livro-web-mobile', 'index.html.eco'), 'utf8');
  let bookBody = transformEco(parseFrontmatter(bookSource).body, path.join(sourceSrc, 'documents', 'livro-web-mobile', 'index.html.eco'));
  bookBody = bookBody.replace(/\b(src|href)=(['"])\/(?!\/)/gi, '$1=$2../');
  const bookStyle = `<style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { background: #fff9eb; color: #373535; line-height: 1.6; margin: 0; }
    .container { margin: 0 auto; max-width: 70rem; padding: 2rem 1.25rem; }
    .autor, .nome { text-align: center; }
    .nome { color: #f47e35; font-family: Georgia, serif; font-size: clamp(2.5rem, 8vw, 6rem); line-height: 1; margin: 1rem auto 2rem; }
    .subtitulo { color: #373535; font-family: system-ui, sans-serif; font-size: clamp(1rem, 2vw, 1.5rem); font-weight: 400; margin: 1rem auto; max-width: 35rem; }
    .ilustracao { margin: 0 auto 2rem; max-width: 35rem; }
    .sobre-container, .compreja-container { background: #fcb870; }
    .sobre { margin: 0 auto; max-width: 55rem; padding: 2rem 0; }
    .sobre-foto { float: left; margin: 0 1.5rem 1rem 0; max-width: 8rem; }
    .capa-livro { display: block; margin: 2rem auto; max-width: min(100%, 28rem); }
    .compre { padding: 2rem 0; text-align: center; }
    .compre-botao { background: #f47e35; color: white; display: inline-block; padding: .8rem 1.2rem; text-decoration: none; }
    img { height: auto; max-width: 100%; }
    @media (max-width: 42rem) { .sobre-foto { float: none; margin: 0 auto 1rem; display: block; } }
  </style>`;
  fs.mkdirSync(path.join(publicRoot, 'livro-web-mobile'), { recursive: true });
  fs.writeFileSync(path.join(publicRoot, 'livro-web-mobile', 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>A Web Mobile — Sérgio Lopes</title>${bookStyle}</head><body>${bookBody}</body></html>`);

  // The historical examples referenced their shared styles from the
  // examples directory. Keep those relative URLs valid in both book copies.
  const examplesCss = path.join(publicRoot, 'livro-web-mobile', 'exemplos.css');
  const examplesDirs = [
    path.join(publicRoot, 'livro-web-mobile', 'exemplos'),
    path.join(publicRoot, 'mobile-web-book', 'examples'),
  ];
  const switchCss = `/* Small static switch skin used by the touch examples. */\n.switch { align-items: center; display: inline-flex; gap: .5rem; }\n.switch input { accent-color: #f47e35; }\n`;
  for (const directory of examplesDirs) {
    fs.mkdirSync(directory, { recursive: true });
    if (fs.existsSync(examplesCss)) fs.copyFileSync(examplesCss, path.join(directory, 'exemplos.css'));
    fs.writeFileSync(path.join(directory, 'switch.css'), switchCss);
  }

  // One QCon notes page used an old standalone stylesheet that was never
  // checked into the repository. A small local skin keeps the historical
  // page self-contained without inventing any missing content.
  const qconDir = path.join(publicRoot, 'qconsp-responsive-design-eduardo-shiota');
  fs.mkdirSync(qconDir, { recursive: true });
  fs.writeFileSync(path.join(qconDir, 'estilo.css'), '.archive-entry__content figure { margin: 1.5rem 0; }\n.archive-entry__content figure img { height: auto; max-width: 100%; }\n');

  // Quadro is a document with a tiny DocPad frontmatter wrapper. Keep its
  // local audio asset and expose a static HTML page for the archive.
  const quadro = fs.readFileSync(path.join(sourceSrc, 'documents', 'quadro', 'index.html'), 'utf8');
  const quadroBody = parseFrontmatter(quadro).body.replaceAll("'/quadro/quadro.mp3'", "'./quadro.mp3'");
  fs.mkdirSync(path.join(publicRoot, 'quadro'), { recursive: true });
  fs.writeFileSync(path.join(publicRoot, 'quadro', 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Quadro Família Andrade Lopes</title></head><body>${quadroBody}</body></html>`);
  fs.copyFileSync(path.join(sourceSrc, 'documents', 'quadro', 'quadro.mp3'), path.join(publicRoot, 'quadro', 'quadro.mp3'));
}

const entries = await buildArchive();
buildLegacyRedirects();
copyLegacyAssets();
// Keep migration and ordinary builds on the same feed/sitemap generator.
// The generator reads the JSON now written above and has no dependency on
// the private source checkout during a normal Astro build.
generateSiteIndexes();
const counts = entries.reduce((result, entry) => {
  result[entry.kind] = (result[entry.kind] || 0) + 1;
  return result;
}, {});
console.log(JSON.stringify({ sourceRoot, entries: entries.length, counts }, null, 2));
