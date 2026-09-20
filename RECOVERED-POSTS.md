# Registros históricos recuperados

`src/data/posts-recovered.json` reúne 105 registros locais adicionados ao arquivo, todos com data preenchida:

- 83 posts do Tatanka, recuperados de páginas HTTP e capturas do Wayback entre 2004 e 2005.
- 20 posts do JavaBlogs Brasil/Jablo, recuperados de duas capturas do Wayback (2004-10-23 e 2005-01-21). A entrada de imagem do post sobre Firefox e Flash Player ficou como fallback textual porque a imagem não foi capturada.
- 2 artigos novos do Alura, com snapshots HTML de `Como lidar com limites de resolução em sites responsivos` e `Ordenação de números no JavaScript não funciona?`.

Os textos preservam os links e a proveniência original. Links entre posts recuperados do Tatanka apontam para as cópias locais; os URLs `originalUrl` e `waybackUrl` permanecem nos metadados e na página. Quatro imagens do conjunto Tatanka não tiveram captura utilizável e mantêm fallback textual. Foram copiados seis assets Tatanka e uma imagem de destaque do artigo de ordenação do Alura para `public/mirrors/`.

As duas republicações que repetem conteúdo já arquivado não criam novas rotas: o artigo de CSS do Alura aparece como referência relacionada ao snapshot Caelum, e o texto do iMasters como referência relacionada ao snapshot sobre a arquitetura do site do Alura. Cada referência preserva o link original e a captura disponível no Wayback.

O anúncio do antigo blog cultural do Tatanka permanece somente como registro histórico; nenhum post cultural foi inventado ou incluído na recuperação.

O checker `npm run check:links` valida as 105 páginas recuperadas, seus corpos quando há snapshot, os links de origem e os slugs em conjunto com o arquivo atual. A cobertura do checkout privado antigo continua opcional quando `../blog-source` não existe.
