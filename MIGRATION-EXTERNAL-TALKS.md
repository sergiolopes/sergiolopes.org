# External talk material

The old `src/documents/palestras.html.md` contains 43 unique external URLs. This inventory records what was recovered, how it was preserved, and what intentionally remains linked to its original host.

## Local copies

| source | local archive | recovery evidence |
| --- | --- | --- |
| 24 SlideShare decks | `public/talks/slides/*/index.html` and 1,915 `slide-*.webp` files | Each public deck page and every slide image returned HTTP 200 during the capture. The CDN exposed 2,048px-wide source images (with the original deck aspect ratios, including 16:9 and portrait slides); the local viewers use those high-resolution WebP responses instead of the 320px thumbnails. These are image galleries extracted from the available SlideShare HTML, not claims about the original upload format. |
| Google Slides — [QCon HTTP/2](https://docs.google.com/presentation/d/1BVyBcR5AE2kwY7akcmM0O3dDJ5TccY3ew0U9Ux7wsQs/pub?start=false&loop=false&delayms=3000&utm_content=buffer7886e&utm_medium=social&utm_source=twitter.com&utm_campaign=buffer#slide=id.p) | `public/talks/external/qcon-http2.pdf` | The public export endpoint returned HTTP 200 and a 76-page PDF (967,271 bytes). |
| Tatanka / Conexão Java 2005 — [Web MVC com IoC e Reflection](http://www.tatanka.com.br/palestras/cj2005-Web+MVC+IoC+Reflection/) | `public/talks/external/tatanka/index.html` and `codigo/*.txt` | The original page returned HTTP 200. Its 16 linked code files also returned HTTP 200 and were copied locally. Ads, scripts, and the historical email address were removed from the local rendering. |

The local deck galleries link back to their original SlideShare pages. The Google Slides and Tatanka copies also keep their source links on the page and in `src/data/talks-external-links.json`. The original SlideShare profile URL is retained as a collection link; it has no single presentation file to mirror.

## Recordings that remain external

The following 16 items are audiovisual pages, so the migration keeps the original link and context without downloading a video file. This is an intentional scope decision, rather than a failed mirror; no HTTP failure is claimed for these entries.

- [iMasters — Progressive Web Apps / 7 Masters](http://imasters.com.br/design-ux/design-responsivo/video-progressive-web-apps-7masters/)
- [InfoQ — novidades no Web Mobile](http://www.infoq.com/br/interviews/novidades-no-web-mobile)
- [InfoQ — Google App Engine](http://www.infoq.com/br/presentations/appengine-google-cloud)
- [InfoQ — uma tonelada de truques de Web Mobile](http://www.infoq.com/br/presentations/tonelada-truques-web)
- [InfoQ — performance na web / modelo RAIL](https://www.infoq.com/br/presentations/performance-na-web-o-modelo-rail-e-outras-novidades)
- [YouTube — Front In BH](http://www.youtube.com/watch?v=GuPEcngbNAw)
- [YouTube — mesa redonda 7 Masters](http://www.youtube.com/watch?v=bRrZYlbre7M)
- [YouTube — BrazilJS](https://www.youtube.com/watch?v=EMCBd3kw4zs)
- [YouTube — DevCast Web Mobile](https://www.youtube.com/watch?v=_wMx_Yb2lBk)
- [YouTube — Front In Sampa](https://www.youtube.com/watch?v=aH9eVa2cTcM)
- [YouTube — Front In Sampa / responsive design](https://www.youtube.com/watch?v=bJdFqCnxmVY)
- [YouTube — Front In Porto Alegre](https://www.youtube.com/watch?v=mchPQdKbbus)
- [YouTube — SampaJS](https://www.youtube.com/watch?v=mrS4ivgj1Es)
- [YouTube — Front In Sampa 2015](https://www.youtube.com/watch?v=sH7dlRnuh-k&feature=youtu.be&a=)
- [YouTube — Web Day](https://www.youtube.com/watch?v=sVBSNJznDF0)
- [Eventials — Service Workers](https://www.eventials.com/tableless/service-workers-o-jeito-certo-de-fazer-offline/?playlist=palestras-do-tableless-conference-2014)

The complete machine-readable classification, including the original URLs, local paths, recovery statuses, and evidence notes, lives in `src/data/talks-external.json` and `src/data/talks-external-links.json`.
