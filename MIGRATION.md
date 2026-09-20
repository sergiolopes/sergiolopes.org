# Migration inventory

This file records the source-to-static migration of `work/blog-source` into the Astro site. It is intentionally explicit about old runtime features that cannot work on GitHub Pages.

## Content inventory

The source contains 117 files under `src/posts`, all represented in `src/data/archive.json`:

| kind | entries | source groups |
| --- | ---: | --- |
| article | 45 | dated blog posts and event notes |
| talk | 4 | the three interactive presentations and the Front In BH performance talk |
| podcast | 31 | Hipsters.tech and Nerdtech participation links |
| external | 37 | Caelum, Alura, iMasters, Revista W, Medium, and Loop Infinito links |

The filename-derived public slugs are retained, including the legacy presentation routes such as `palestra-mobile-web` and `palestra-retina-web`. `sourcePath` in each entry points back to its original file. Markdown is rendered to static HTML; Eco helpers for YouTube, SlideShare, tweetables, code samples, partial SVGs, and included SVGs are expanded during migration. The responsive design article keeps its complete historical HTML and YouTube embed in the archive entry.

External entries retain `originalUrl`. All 37 external entries now have recovered HTML in `src/data/mirrors.json`, together with their Wayback capture URL and `recoveryStatus: "wayback-capture"`. The route presents the original, the Wayback capture, and the local copy as separate links. Recovered HTML has old analytics attributes, social widgets, and scripts removed while visible prose and links remain.

## Static legacy material

The source `src/files` tree is copied into `public` for images, fonts, examples, audio, manifests, and linked HTML resources. The copied demo scripts are scrubbed of Google Analytics and external-link tracking. The old IcoMoon export session (which contained an email and an editor secret) is deliberately excluded.

The old Apache short links are represented as static HTML pages:

- `m0`/`mo` through `m16` point to `livro-web-mobile/exemplos/*`.
- `e0`/`eo` through `e16` point to `mobile-web-book/examples/*`.
- `mobile-web-book/` keeps the old redirect to Code Crushing.

These are HTML meta-refresh pages with a JavaScript fallback, so they work as files on GitHub Pages and do not depend on Apache.

The old document pages also have static equivalents: `/livro-web-mobile/` keeps the book landing page and examples, `/palestras/` and `/sobre/` are Astro pages, `/quadro/` keeps its local audio resource, and `/feed.xml`, `/atom.xml`, `/sitemap.txt`, and `/sitemap.xml` are generated from the archive. The old `robots.txt` now points at the GitHub Pages sitemap.

## Known omissions and changes

- `src/files/aovivo/live.php` and `src/files/aovivo/.htaccess` are not copied. The live presentation room, PHP endpoint, and WebSocket pairing service are not available on this static deployment. The presentation text and demos remain available as historical HTML.
- The old `sergiolopes.no-ip.biz` WebSocket service is not loaded by the new article route. The interactive presentation controller is therefore preserved as source material, while the archive pages do not promise live synchronization.
- The Bitly API call in the old mobile presentation script is removed; its embedded API key is not published. The original short-link service is unavailable in the archive.
- Google Analytics, external-link tracking, Twitter widgets, and Facebook comment/share runtime code are not loaded. Mentions of these services inside historical article text and code examples remain part of the historical record.
- The old Stylus bundles and DocPad layouts are not used as the new site's global styling system. The responsive-design, SVG animation, email, and directory posts keep dedicated static CSS; talks load a compact presentation skin and the original local keyboard/touch controller. Live synchronization remains disabled.
- The responsive-design article keeps its local interaction and HTTPS YouTube embed. Its old Arquitetura Java iframe now shows a local archive notice linking to the current HTTPS Alura destination because the historical page redirects and is no longer the same demo.
- Feed and sitemap equivalents are generated at build-input time with the current GitHub Pages origin (`https://sergiolopes.github.io/sergiolopes.org`). They should be regenerated after the custom domain is finalized.
- The three interactive presentation routes and the linked local assets under `public/livro-web-mobile`, `public/mobile-web-book`, and `public/resources/palestra-retina` are mirrored. The 43 unique external links from the old talks page are accounted for in [MIGRATION-EXTERNAL-TALKS.md](MIGRATION-EXTERNAL-TALKS.md): 24 SlideShare decks have local HTML galleries with 1,915 captured 2,048px slide images, the public Google Slides deck has a local 76-page PDF, and the 2005 Tatanka presentation has local HTML plus its 16 linked code files. Original links remain beside every local copy. The profile page and 16 video or interview recordings remain outbound by design; the audiovisual files were not downloaded.
- `npm run migrate` expects the private source checkout at `../blog-source` and regenerates the source-derived archive, copied legacy files, redirects, feed, and sitemap. It does not overwrite the hand-curated `src/data/mirrors.json`, `src/data/podcasts-new.json`, `src/data/talks-external.json`, `src/data/talks-external-links.json`, or the recovered files under `public/talks`.
- A link audit (`npm run check:links`) currently covers all 117 source post files, 42 document files, 271 generated HTML files, and 15 CSS files with zero broken internal references. External URLs are intentionally excluded from that local check.

`public/quadro/index.html` and its local MP3 are retained as a static resource. It still uses the historical WaveSurfer CDN script when opened directly; it has no PHP dependency.
