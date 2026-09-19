# sergiolopes.org

Site pessoal de Sérgio Lopes, feito com Astro.

## Desenvolvimento

Use Node.js 24 (`nvm use`).

```sh
npm ci
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

## Publicação

Cada push em `main` gera o site e publica no GitHub Pages via GitHub Actions.

Endereço temporário: https://sergiolopes.github.io/sergiolopes.org/

O domínio próprio ainda não está configurado. `site` e `base` estão definidos em `astro.config.mjs` para o endereço temporário.
