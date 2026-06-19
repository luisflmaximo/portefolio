# Luís Máximo — Portfolio Site

Site pessoal de portefólio e currículo, construído em HTML/CSS/JS puro, desenhado para funcionar no GitHub Pages.

---

## 📁 Estrutura de Ficheiros

```
portefolio/
├── index.html                      ← Redireciona automaticamente PT/EN conforme o browser
├── 404.html                        ← Página de erro personalizada
├── site.webmanifest                ← Configuração PWA (Progressive Web App)
├── robots.txt                      ← Instruções para motores de busca
├── sitemap.xml                     ← Mapa do site para SEO (hreflang PT/EN)
│
├── assets/
│   ├── css/
│   │   ├── style.css               ← Folha de estilos principal (portefólio)
│   │   ├── tools.css               ← Estilos do catálogo de ferramentas e AI Chat
│   │   └── media-studio.css        ← Estilos do Estúdio de Multimédia
│   ├── js/
│   │   ├── main.js                 ← JavaScript partilhado (nav, tema, scroll)
│   │   ├── secret-tools.js         ← Lógica do catálogo e paginação incremental
│   │   ├── secret-ai.js            ← Chatbot multimodal (Gemini via Cloudflare Worker)
│   │   ├── secret-ai-config.js     ← Configuração do endpoint do Worker
│   │   └── media-studio.js         ← Estúdio de Multimédia (upload, batch, download)
│   └── images/
│       ├── profile.jpg             ← Fotografia de perfil
│       ├── banner.png              ← Banner OG (Open Graph) — 2848×1504 px
│       ├── banner-social.jpg       ← Versão comprimida do banner para redes sociais
│       ├── icon.png                ← Favicon (32×32)
│       ├── icon-192.png            ← Ícone PWA (192×192)
│       ├── icon-512.png            ← Ícone PWA (512×512)
│       └── apple-touch-icon.png    ← Ícone para iOS (180×180)
│
├── docs/
│   ├── CV_Luís_Máximo_PT.pdf       ← Currículo em português (para download)
│   ├── CV_Luís_Máximo_EN.pdf       ← Curriculum vitae in English (for download)
│   ├── superbock.pdf               ← Relatório Super Bock (PDF completo)
│   ├── superbock-viewer.html       ← Visualizador interativo do relatório Super Bock
│   └── superbock-pages/            ← Páginas do relatório em formato WebP (page-001 … page-071)
│
├── pt/                             ← Versão portuguesa
│   ├── index.html                  ← Página inicial
│   ├── projetos/index.html         ← Página de projetos
│   └── curriculo/index.html        ← Página de currículo
│
├── en/                             ← English version
│   ├── index.html                  ← Home page
│   ├── projects/index.html         ← Projects page
│   └── curriculum/index.html       ← Curriculum page
│
├── secret/                         ← Secção oculta (não indexada)
│   ├── index.html                  ← Launcher do catálogo e AI Chat
│   ├── tools-data.json             ← Base de dados do catálogo (~2150 ferramentas)
│   └── estudio/
│       └── index.html              ← Estúdio de Multimédia em lote
│
└── cloudflare/
    └── secret-ai/                  ← Cloudflare Worker (proxy da API Gemini)
        ├── worker.js               ← Código-fonte do Worker
        ├── wrangler.toml           ← Configuração do Wrangler (nome, rotas, variáveis)
        └── README.md               ← Instruções de deploy do Worker
```

---

## 🚀 Como colocar no GitHub Pages

### Passo 1 — Criar conta e repositório no GitHub
1. Vai a [github.com](https://github.com) e cria uma conta.
2. Clica em **"New repository"** no canto superior direito.
3. Nome do repositório: `portefolio` (ou o nome que desejares).
4. Marca como **Public**.
5. Clica em **"Create repository"**.

### Passo 2 — Fazer upload dos ficheiros
1. No repositório criado, clica em **"uploading an existing file"**.
2. Arrasta **todos os ficheiros e pastas** desta pasta para a janela do browser.
3. Escreve uma mensagem de commit (ex.: `"Atualização do site"`) e clica em **"Commit changes"**.

### Passo 3 — Ativar o GitHub Pages
1. No repositório, vai a **Settings** (ícone de engrenagem).
2. No menu lateral, clica em **Pages**.
3. Em "Source", seleciona **"Deploy from a branch"**.
4. Em "Branch", escolhe **"main"** e a pasta **"/ (root)"**.
5. Clica em **Save**.

### Passo 4 — Aceder ao site
Após 1-2 minutos, o teu site estará disponível em:
```
https://luisflmaximo.github.io/portefolio/
```

---

## ✍️ Como atualizar conteúdo

### Alterar dados pessoais ou texto
- Edita os ficheiros `pt/index.html` e `en/index.html` diretamente.
- O currículo fica em `pt/curriculo/index.html` e `en/curriculum/index.html`.

### Atualizar os CVs para download
Substitui os ficheiros em `/docs/` pelos novos PDFs (mantém os mesmos nomes):
- `CV_Luís_Máximo_PT.pdf` — versão portuguesa
- `CV_Luís_Máximo_EN.pdf` — versão inglesa

### Adicionar um trabalho académico (PDF)
1. Coloca o ficheiro PDF na pasta `/docs/`.
2. Abre `/pt/projetos/index.html` e `/en/projects/index.html`.
3. Procura o comentário `EXEMPLO de como ficará um trabalho real`, copia o bloco, descomenta-o e preenche os dados do projeto.

### Adicionar embeds do Instagram (Politiza-te)
1. Abre uma publicação do Instagram no computador, clica nos três pontos `···` e escolhe **"Incorporar"**.
2. Copia o código HTML e substitui o conteúdo do slot nos ficheiros de projetos.

---

## 🔍 Secção Secreta

A secção secreta é ativada clicando **5 vezes** na fotografia de perfil da página inicial.
- Funciona em mobile e PC.
- Não está indexada nos motores de busca (`noindex, nofollow`).
- URL: `/secret/` — inclui três ferramentas:

| Ferramenta | Descrição |
|---|---|
| **Catálogo de Ferramentas** | Mais de 2150 recursos organizados por categorias, com paginação incremental fluida e pesquisa. |
| **Assistente IA (Chat)** | Chatbot multimodal (Gemini via Cloudflare Worker) que recomenda itens do catálogo. Suporta imagens coladas com `Ctrl+V` e chips de prompt rápido. |
| **Estúdio de Multimédia** | Ferramenta avançada para gestão, pré-visualização e download em lote de recursos (ficheiros, pastas, links). |

---

## ☁️ Cloudflare Worker (AI Proxy)

A pasta `/cloudflare/secret-ai/` contém o código-fonte do Worker que serve de proxy entre o chatbot e a API Gemini.
Permite manter a chave de API segura no servidor, sem a expor no código do browser.

Para fazer deploy:
1. Instala o [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler`
2. Na pasta do worker: `wrangler login` e depois `wrangler deploy`
3. Atualiza o endpoint em `assets/js/secret-ai-config.js`.

---

## 📱 Compatibilidade

| Browser / Plataforma | Suporte |
|---|---|
| Chrome, Edge (desktop) | ✅ Total |
| Firefox (desktop) | ✅ Total |
| Safari (macOS) | ✅ Total |
| iOS Safari (iPhone/iPad) | ✅ Total |
| Android Chrome | ✅ Total |
| Responsive (todos os tamanhos) | ✅ Total |

---

## 🔧 Tecnologias

- **HTML5 / CSS3 / JavaScript** (puro, sem frameworks)
- **GitHub Pages** (alojamento gratuito)
- **Cloudflare Workers** (proxy da API de IA)
- **Google Fonts** (tipografia)
- **Schema.org / JSON-LD** (dados estruturados para SEO)
- **Open Graph / Twitter Cards** (pré-visualizações em redes sociais)
