# Luís Máximo — Portefólio Pessoal

**Site pessoal de portefólio e currículo** de Luís Máximo, estudante de Gestão na [ISCTE Business School](https://ibs.iscte-iul.pt/), Lisboa.

🔗 **[luisflmaximo.github.io/portefolio](https://luisflmaximo.github.io/portefolio/)**

---

## Sobre o Site

Este site apresenta o percurso académico, os projetos e a atividade pública de Luís Máximo. Está disponível em dois idiomas — **Português** e **Inglês** — com redirecionamento automático com base na preferência de idioma do browser.

O site é construído inteiramente em **HTML, CSS e JavaScript puros**, sem frameworks, e alojado no **GitHub Pages**.

---

## Secções

### Portefólio
Página de apresentação com fotografia, dados de contacto, redes sociais e publicações recentes do LinkedIn. Inclui artigos e conteúdo sobre política, economia e participação cívica.

### Projetos
Trabalhos académicos, análises de gestão e conteúdo produzido no âmbito do projeto **[Politiza-te](https://www.instagram.com/politizate_/)** — uma iniciativa de literacia política nas redes sociais. Inclui o acesso ao relatório de análise da **Super Bock** e documentos académicos em PDF.

### Currículo
Percurso académico e experiências relevantes, com opção de download do CV em **português** (`CV_Luís_Máximo_PT.pdf`) e em **inglês** (`CV_Luís_Máximo_EN.pdf`).

---

## Características Técnicas

| Característica | Detalhe |
|---|---|
| Idiomas | Português (PT) · Inglês (EN) |
| Redirecionamento automático | Por preferência do browser ou escolha guardada |
| SEO | Schema.org / JSON-LD · Open Graph · Twitter Cards · Sitemap XML · hreflang |
| PWA | `site.webmanifest` com shortcuts, ícones e suporte a instalação |
| Tipografia | [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond) + [Outfit](https://fonts.google.com/specimen/Outfit) (Google Fonts) |
| Acessibilidade | Skip links · ARIA labels · focus management |
| Compatibilidade | Chrome · Firefox · Safari · Edge · iOS · Android |

---

## Secção de Ferramentas *(privada)*

Acessível de forma não pública, esta secção inclui um conjunto de utilitários pessoais:

- **Catálogo de Ferramentas** — base de dados com mais de 2 150 recursos digitais organizados por categoria, com pesquisa e paginação incremental.
- **Assistente IA** — chatbot multimodal (Gemini, via Cloudflare Worker) que recomenda recursos do catálogo. Suporta anexo e colagem de imagens.
- **Estúdio de Multimédia** — ferramenta de gestão e download em lote de ficheiros, pastas e links.

O proxy da API de IA corre num **Cloudflare Worker** (`/cloudflare/secret-ai/`), mantendo a chave de API segura no servidor.

---

## Estrutura do Repositório

```
portefolio/
├── index.html                      ← Redireciona PT/EN automaticamente
├── 404.html                        ← Página de erro personalizada
├── site.webmanifest                ← Configuração PWA
├── robots.txt                      ← Diretivas para motores de busca
├── sitemap.xml                     ← Sitemap com hreflang PT/EN
├── assets/
│   ├── css/
│   │   ├── style.css               ← Estilos do portefólio
│   │   ├── tools.css               ← Estilos do catálogo e AI Chat
│   │   └── media-studio.css        ← Estilos do Estúdio de Multimédia
│   ├── js/
│   │   ├── main.js                 ← JavaScript partilhado
│   │   ├── secret-tools.js         ← Catálogo de ferramentas
│   │   ├── secret-ai.js            ← Chatbot multimodal
│   │   ├── secret-ai-config.js     ← Endpoint do Cloudflare Worker
│   │   └── media-studio.js         ← Estúdio de Multimédia
│   └── images/                     ← Fotografia, banner, ícones PWA
├── docs/
│   ├── CV_Luís_Máximo_PT.pdf       ← Currículo em português
│   ├── CV_Luís_Máximo_EN.pdf       ← Curriculum vitae in English
│   ├── superbock.pdf               ← Relatório Super Bock
│   ├── superbock-viewer.html       ← Visualizador interativo do relatório
│   └── superbock-pages/            ← Páginas do relatório em WebP (71 páginas)
├── pt/                             ← Versão portuguesa (Início · Projetos · Currículo)
├── en/                             ← English version (Home · Projects · Curriculum)
├── secret/                         ← Ferramentas privadas (não indexadas)
│   ├── index.html
│   ├── tools-data.json             ← Base de dados do catálogo (~2 150 entradas)
│   └── estudio/index.html
└── cloudflare/
    └── secret-ai/                  ← Cloudflare Worker (proxy Gemini API)
        ├── worker.js
        └── wrangler.toml
```

---

## Contacto

| | |
|---|---|
| **Email** | [luisflmaximo8@gmail.com](mailto:luisflmaximo8@gmail.com) |
| **LinkedIn** | [linkedin.com/in/luisflmaximo](https://www.linkedin.com/in/luisflmaximo/) |
| **Instagram** | [@luisflmaximo](https://www.instagram.com/luisflmaximo/) |
| **X / Twitter** | [@luisflmaximo](https://x.com/luisflmaximo) |
