# sergiolopes.org

Arquivo pessoal de Sérgio Lopes: artigos, mirrors de textos publicados em outros sites, palestras, livros e conversas em podcasts. O projeto é um site estático em Astro, publicado no GitHub Pages em `https://sergiolopes.github.io/sergiolopes.org/` enquanto o domínio próprio não é ligado.

## Desenvolvimento

Use Node.js 22.12 ou mais recente (o ambiente usado no projeto é Node.js 24).

```sh
npm ci
npm run dev
```

O servidor local usa a mesma base `/sergiolopes.org/` do Pages. Para conferir a saída estática:

```sh
npm run build
npm run preview
```

## Organização do conteúdo

- `src/data/archive.json` guarda os 117 registros importados do antigo DocPad.
- `src/data/mirrors.json` guarda as cópias locais dos 37 textos que foram publicados originalmente na Caelum, Alura, iMasters e outros sites.
- `src/data/podcasts-new.json` guarda as participações encontradas depois da última atualização do blog. O arquivo atual tem 63 registros novos (17 Hipsters Ponto Tech + 46 IA Sob Controle); somados aos 31 podcasts legados, são 94 podcasts.
- `src/lib/archive.ts` combina os JSONs, aplica os mirrors e fornece os filtros usados pelas páginas.
- `src/pages/artigos/`, `src/pages/podcasts/` e `src/pages/arquivo/` formam as listas e os índices anuais. A rota dinâmica `src/pages/[...slug].astro` renderiza cada registro.
- `public/` contém a foto, arquivos estáticos das palestras e do livro, assets recuperados e redirects HTML dos caminhos antigos.
- `scripts/generate-site-indexes.mjs` gera `feed.xml`, `atom.xml`, `sitemap.xml`, `sitemap.txt` e `robots.txt` a partir dos JSONs atuais.
- `scripts/check-links.mjs` verifica links internos, âncoras, assets e a presença dos documentos migrados.

Os números são deliberadamente derivados dos dados: neste momento o arquivo tem 180 registros, 82 itens na estante de artigos (artigos próprios e mirrors), 94 podcasts e 4 palestras.

## Como adicionar conteúdo

Para adicionar um podcast, acrescente um objeto em `src/data/podcasts-new.json` seguindo este contrato:

```json
{
  "slug": "podcast-episodio",
  "title": "Título do episódio",
  "date": "2026-09-19",
  "kind": "podcast",
  "category": "Hipsters Ponto Tech",
  "description": "Resumo curto para os índices.",
  "html": "<p>Contexto preservado no arquivo.</p>",
  "originalUrl": "https://exemplo.com/episodio",
  "sourcePath": "https://exemplo.com/episodio"
}
```

O `slug` vira a URL do registro. A data faz o item aparecer automaticamente no índice anual, no feed e no sitemap. Para uma participação sem texto local, use `html: ""`; a página ainda preserva os links original e do Wayback quando eles existirem.

Para um artigo próprio, inclua o registro em `src/data/archive.json` com `kind: "article"`. Para um texto originalmente hospedado fora daqui, mantenha o registro `kind: "external"` no arquivo principal e coloque a cópia recuperada em `src/data/mirrors.json` sob o mesmo slug, com `html`, `originalUrl`, `archiveUrl` e a data histórica. Assim ele aparece tanto em **Artigos** quanto em **Participações**.

O comando `npm run migrate` é uma operação de recuperação do DocPad e só deve ser usado quando o checkout privado antigo estiver disponível como `../blog-source`. Ele reescreve o arquivo legado e copia assets. O build normal não chama esse comando e não depende desse checkout.

## Build e verificações

```sh
npm run build
npm run check:links
```

`npm run build` primeiro roda `generate:indexes` e depois `astro build`. Isso faz qualquer novo artigo ou podcast refletir imediatamente nos feeds, no sitemap e nos índices anuais, sem executar a migração do repositório antigo.

`check:links` pode ser executado em um clone isolado. Quando `../blog-source` existir, ele também compara a cobertura do arquivo com os posts e documentos de origem; quando não existir, faz as verificações da saída atual e marca essa comparação como ignorada.

## Publicação

Cada push em `main` executa o workflow do GitHub Actions, roda o build e publica `dist/` no GitHub Pages. O endereço temporário é:

<https://sergiolopes.github.io/sergiolopes.org/>

Quando o domínio próprio for configurado, basta atualizar `site`/`base` em `astro.config.mjs` e o `SITE_URL` usado na geração dos índices.
