import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const sourceRoot = path.resolve(root, '..', 'blog-source');
const base = '/sergiolopes.org';

function walk(dir, extensions = null) {
  if (!fs.existsSync(dir)) return [];
  const output = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) output.push(...walk(full, extensions));
    else if (!extensions || extensions.some((extension) => full.endsWith(extension))) output.push(full);
  }
  return output;
}

function decodePath(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function isExternal(value) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\/\/?$)/i.test(value)
    || value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('*|')
    || value.includes('{{') || value.includes('${');
}

function targetCandidates(fromFile, raw) {
  const withoutHash = raw.split('#', 1)[0].split('?', 1)[0];
  if (!withoutHash) return [];
  let relative;
  if (withoutHash.startsWith('/')) {
    const clean = decodePath(withoutHash.replace(/^\/+/, ''));
    relative = clean.startsWith(base.slice(1)) ? clean.slice(base.length - 1).replace(/^\/+/, '') : clean;
  } else {
    relative = path.relative(dist, path.resolve(path.dirname(fromFile), decodePath(withoutHash)));
  }
  relative = relative.replaceAll(path.sep, '/').replace(/^\.\//, '');
  const candidates = [];
  if (relative.endsWith('/')) candidates.push(path.join(dist, relative, 'index.html'));
  else if (path.extname(relative)) candidates.push(path.join(dist, relative));
  else candidates.push(path.join(dist, relative, 'index.html'), path.join(dist, `${relative}.html`));
  return candidates;
}

function findAttributeReferences(content) {
  const references = [];
  const pattern = /\b(?:href|src|poster|action|data-src)\s*=\s*(['"])(.*?)\1/gi;
  for (const match of content.matchAll(pattern)) references.push({ raw: match[2], index: match.index });
  for (const match of content.matchAll(/\b(?:srcset|imagesrcset)\s*=\s*(['"])(.*?)\1/gi)) {
    for (const part of match[2].split(',')) references.push({ raw: part.trim().split(/\s+/)[0], index: match.index });
  }
  return references;
}

function localCssReferences(content) {
  return [...content.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)]
    .map((match) => ({ raw: match[2], index: match.index }));
}

function idsIn(content) {
  return new Set([...content.matchAll(/\bid\s*=\s*(['"])(.*?)\1/gi)].map((match) => match[2]));
}

function verifyReference(fromFile, reference, idMap) {
  const raw = reference.raw.trim();
  if (!raw || isExternal(raw)) return null;
  const hash = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1) : '';
  const candidates = targetCandidates(fromFile, raw);
  const target = candidates.find((candidate) => fs.existsSync(candidate));
  if (!target) {
    return { from: path.relative(root, fromFile), raw, reason: 'missing target', candidates: candidates.map((item) => path.relative(dist, item)) };
  }
  if (hash && hash !== '' && !hash.startsWith('!')) {
    const ids = idMap.get(target);
    if (ids && !ids.has(hash)) return { from: path.relative(root, fromFile), raw, reason: `missing anchor #${hash}`, candidates: [path.relative(dist, target)] };
  }
  return null;
}

function sourceInventory() {
  const archive = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'archive.json'), 'utf8'));
  const postsRoot = path.join(sourceRoot, 'src', 'posts');
  // The migrated site is self-contained. Keep the richer source coverage
  // report when the old checkout is beside it, but let CI and contributors
  // run this check from a fresh clone without that private directory.
  if (!fs.existsSync(postsRoot)) {
    return { sourcePosts: null, archiveEntries: archive.length, missing: [], duplicated: [], skipped: true };
  }
  const postFiles = walk(postsRoot, ['.md', '.eco', '.html']);
  const covered = new Set(archive.map((entry) => entry.sourcePath));
  const missing = postFiles
    .map((file) => `src/posts/${path.relative(postsRoot, file).replaceAll(path.sep, '/')}`)
    .filter((file) => !covered.has(file));
  const duplicated = archive.map((entry) => entry.slug).filter((slug, index, values) => values.indexOf(slug) !== index);
  return { sourcePosts: postFiles.length, archiveEntries: archive.length, missing, duplicated, skipped: false };
}

function documentInventory() {
  const documents = walk(path.join(sourceRoot, 'src', 'documents'))
    .map((file) => path.relative(path.join(sourceRoot, 'src', 'documents'), file).replaceAll(path.sep, '/'));
  const equivalents = {
    'feed.xml.eco': 'feed.xml',
    'sitemap.txt.eco': 'sitemap.txt',
    'livro-web-mobile/index.html.eco': 'livro-web-mobile/index.html',
    'palestras.html.md': 'palestras/index.html',
    'sobre.html.md': 'sobre/index.html',
    'quadro/index.html': 'quadro/index.html',
  };
  const missing = Object.entries(equivalents)
    .filter(([, output]) => !fs.existsSync(path.join(dist, output)))
    .map(([source, output]) => ({ source, output }));
  return { documents: documents.length, missing, sourceFiles: documents };
}

function talkInventory() {
  const slideDataPath = path.join(root, 'src', 'data', 'talks-external.json');
  const externalDataPath = path.join(root, 'src', 'data', 'talks-external-links.json');
  const sourceDocument = path.join(sourceRoot, 'src', 'documents', 'palestras.html.md');
  if (!fs.existsSync(slideDataPath) || !fs.existsSync(externalDataPath) || !fs.existsSync(sourceDocument)) {
    return { sourceUrls: null, classifiedUrls: null, localMaterials: null, missingLocal: [], slideCountMismatches: [], skipped: true };
  }
  const slideDecks = JSON.parse(fs.readFileSync(slideDataPath, 'utf8'));
  const externalMaterials = JSON.parse(fs.readFileSync(externalDataPath, 'utf8'));
  const sourceText = fs.readFileSync(sourceDocument, 'utf8');
  const sourceUrls = new Set(
    [...sourceText.matchAll(/https?:\/\/[^\s)\]"']+/g)].map((match) => match[0].replace(/[.,]+$/, '')),
  );
  const classifiedUrls = new Set([...slideDecks, ...externalMaterials].map((item) => item.originalUrl));
  const localItems = [...slideDecks, ...externalMaterials].filter((item) => item.localPath);
  const missingLocal = [];
  for (const item of localItems) {
    const paths = [item.localPath, item.assetPath].filter(Boolean);
    for (const itemPath of paths) {
      const localPath = itemPath.replace(/\/+$/, '');
      const candidate = path.join(dist, localPath, 'index.html');
      const fileCandidate = path.join(dist, localPath);
      if (!fs.existsSync(candidate) && !fs.existsSync(fileCandidate)) missingLocal.push({ slug: item.slug, localPath: itemPath });
    }
  }
  const slideCountMismatches = [];
  for (const deck of slideDecks) {
    const directory = path.join(dist, deck.localPath);
    const imageCount = fs.existsSync(directory)
      ? fs.readdirSync(directory).filter((name) => /^slide-\d+\.(?:jpg|webp)$/i.test(name)).length
      : 0;
    if (imageCount !== deck.slideCount) slideCountMismatches.push({ slug: deck.slug, expected: deck.slideCount, actual: imageCount });
  }
  return {
    sourceUrls: sourceUrls.size,
    classifiedUrls: classifiedUrls.size,
    localMaterials: localItems.length,
    missingLocal,
    slideCountMismatches,
    unclassified: [...sourceUrls].filter((url) => !classifiedUrls.has(url)),
    extraClassifications: [...classifiedUrls].filter((url) => !sourceUrls.has(url)),
    skipped: false,
  };
}

function talkHistoryInventory() {
  const historyPath = path.join(root, 'src', 'data', 'talks-history.json');
  const indexPath = path.join(dist, 'palestras', 'index.html');
  if (!fs.existsSync(historyPath) || !fs.existsSync(indexPath)) {
    return {
      expected: 102,
      records: 0,
      missingIds: [],
      duplicateIds: [],
      sourceRecords: null,
      sourceMissing: [],
      sourceUrlsMissing: [],
      sourceCounts: null,
      dataCounts: null,
      skipped: true,
    };
  }

  const records = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  const ids = records.map((record) => record.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const missingIds = ids.filter((id) => !indexHtml.includes(`data-talk-id="${id}"`));
  const dataCounts = Object.fromEntries(
    [...new Set(records.map((record) => record.year))]
      .sort((a, b) => b - a)
      .map((year) => [year, records.filter((record) => record.year === year).length]),
  );
  const dataWithoutLinks = records.filter((record) => !record.links?.length).length;

  const sourceDocument = path.join(sourceRoot, 'src', 'documents', 'palestras.html.md');
  if (!fs.existsSync(sourceDocument)) {
    return {
      expected: 102,
      records: records.length,
      missingIds,
      duplicateIds,
      sourceRecords: null,
      sourceMissing: [],
      sourceUrlsMissing: [],
      sourceCounts: null,
      dataCounts,
      dataWithoutLinks,
      skipped: false,
    };
  }

  const sourceLines = fs.readFileSync(sourceDocument, 'utf8').split(/\r?\n/);
  let sourceYear = null;
  const sourceRecords = [];
  const sourceUrls = new Set();
  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index];
    const heading = line.match(/^#\s+(\d{4})\s*$/);
    if (heading) sourceYear = Number(heading[1]);
    if (!/^\*\s+/.test(line)) continue;
    const event = line.match(/^\*\s+(?:\*[^*]+\*\s+-\s+)?\*\*([^*]+)\*\*\s*(?:-|:)\s*/);
    if (!event) continue;
    sourceRecords.push({ line: index + 1, year: sourceYear, event: event[1], text: line });
    for (const match of line.matchAll(/\]\((https?:\/\/[^)]+|\/[^)]+)\)/g)) sourceUrls.add(match[1]);
    let nestedIndex = index + 1;
    while (nestedIndex < sourceLines.length && /^\s+\*\s+/.test(sourceLines[nestedIndex])) {
      for (const match of sourceLines[nestedIndex].matchAll(/\]\((https?:\/\/[^)]+|\/[^)]+)\)/g)) sourceUrls.add(match[1]);
      nestedIndex += 1;
    }
  }
  const recordsByLine = new Map(records.map((record) => [record.sourceLine, record]));
  const sourceMissing = sourceRecords
    .filter((sourceRecord) => {
      const record = recordsByLine.get(sourceRecord.line);
      return !record
        || record.year !== sourceRecord.year
        || record.event !== sourceRecord.event
        || !sourceRecord.text.replaceAll('*', '').includes(record.title);
    })
    .map((sourceRecord) => ({ line: sourceRecord.line, year: sourceRecord.year, event: sourceRecord.event }));
  const historyUrls = new Set(records.flatMap((record) => (record.links || []).map((link) => link.url)));
  const sourceUrlsMissing = [...sourceUrls].filter((url) => !historyUrls.has(url));
  const sourceCounts = Object.fromEntries(
    [...new Set(sourceRecords.map((record) => record.year))]
      .sort((a, b) => b - a)
      .map((year) => [year, sourceRecords.filter((record) => record.year === year).length]),
  );
  const sourceWithoutLinks = records.filter((record) => !record.links?.length).length;
  return {
    expected: 102,
    records: records.length,
    missingIds,
    duplicateIds,
    sourceRecords: sourceRecords.length,
    sourceMissing,
    sourceUrlsMissing,
    sourceCounts: { ...sourceCounts, withoutLinks: sourceWithoutLinks },
    dataCounts: { ...dataCounts, withoutLinks: dataWithoutLinks },
    skipped: false,
  };
}

if (!fs.existsSync(dist)) {
  console.error('dist/ não existe; rode npm run build antes de checar links.');
  process.exit(2);
}

const htmlFiles = walk(dist, ['.html']);
const cssFiles = walk(dist, ['.css']);
const idMap = new Map(htmlFiles.map((file) => [file, idsIn(fs.readFileSync(file, 'utf8'))]));
const failures = [];
for (const file of htmlFiles) {
  // Ignore examples embedded inside historical HTML comments. They are
  // documentation snippets, not navigable links in the rendered page.
  const content = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  for (const reference of findAttributeReferences(content)) {
    const failure = verifyReference(file, reference, idMap);
    if (failure) failures.push(failure);
  }
}
for (const file of cssFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const reference of localCssReferences(content)) {
    const failure = verifyReference(file, reference, idMap);
    if (failure) failures.push(failure);
  }
}

const uniqueFailures = [...new Map(failures.map((failure) => [`${failure.from}\n${failure.raw}\n${failure.reason}`, failure])).values()];
const source = sourceInventory();
const documents = documentInventory();
const talks = talkInventory();
const talkHistory = talkHistoryInventory();
console.log(JSON.stringify({
  distFiles: walk(dist).length,
  htmlFiles: htmlFiles.length,
  cssFiles: cssFiles.length,
  source,
  documents: { count: documents.documents, missing: documents.missing },
  talks,
  talkHistory,
  brokenInternalReferences: uniqueFailures,
}, null, 2));

if (uniqueFailures.length || source.missing.length || source.duplicated.length || documents.missing.length
  || talks.missingLocal.length || talks.slideCountMismatches.length || talks.unclassified?.length || talks.extraClassifications?.length
  || talkHistory.records !== talkHistory.expected || talkHistory.missingIds.length || talkHistory.duplicateIds.length
  || talkHistory.sourceMissing.length || talkHistory.sourceUrlsMissing.length
  || (talkHistory.sourceCounts && JSON.stringify(talkHistory.sourceCounts) !== JSON.stringify(talkHistory.dataCounts))) process.exitCode = 1;
