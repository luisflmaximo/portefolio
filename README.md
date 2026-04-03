# LuÃ­s MÃ¡ximo â€” Portfolio Site

Site pessoal de portefÃ³lio e currÃ­culo, construÃ­do em HTML/CSS/JS puro, desenhado para funcionar no GitHub Pages.

---

## ðŸ“ Estrutura de Ficheiros

```
portfolio/
â”œâ”€â”€ index.html                  â† Redireciona automaticamente PT/EN
â”œâ”€â”€ 404.html                    â† PÃ¡gina de erro personalizada
â”œâ”€â”€ assets/
â”‚   â”œâ”€â”€ css/style.css           â† Folha de estilos principal
â”‚   â”œâ”€â”€ js/main.js              â† JavaScript partilhado
â”‚   â””â”€â”€ images/
â”‚       â””â”€â”€ profile.jpg         â† Fotografia de perfil
â”œâ”€â”€ docs/
â”‚   â””â”€â”€ CV_Luis_Maximo.pdf      â† CV para download
â”œâ”€â”€ pt/                         â† VersÃ£o portuguesa
â”‚   â”œâ”€â”€ index.html              â† PÃ¡gina inicial
â”‚   â”œâ”€â”€ projetos/index.html     â† PÃ¡gina de projetos
â”‚   â””â”€â”€ curriculo/index.html    â† PÃ¡gina de currÃ­culo
â”œâ”€â”€ en/                         â† English version
â”‚   â”œâ”€â”€ index.html              â† Home page
â”‚   â”œâ”€â”€ projects/index.html     â† Projects page
â”‚   â””â”€â”€ curriculum/index.html   â† Curriculum page
â””â”€â”€ secret/
    â””â”€â”€ index.html              â† PÃ¡gina secreta (5 toques na foto)
```

---

## ðŸš€ Como colocar no GitHub Pages

### Passo 1 â€” Criar conta e repositÃ³rio no GitHub
1. Vai a [github.com](https://github.com) e cria uma conta (se nÃ£o tiveres)
2. Clica em **"New repository"** (botÃ£o verde no canto superior direito)
3. Nome do repositÃ³rio: `luisflmaximo.github.io` (substitui `luisflmaximo` pelo teu username exato do GitHub)
4. Marca como **Public**
5. Clica **"Create repository"**

### Passo 2 â€” Fazer upload dos ficheiros
1. No repositÃ³rio criado, clica em **"uploading an existing file"**
2. Arrasta **todos os ficheiros e pastas** desta pasta para a janela do browser
3. Escreve uma mensagem como "Primeiro commit" no campo em baixo
4. Clica **"Commit changes"**

### Passo 3 â€” Ativar o GitHub Pages
1. No repositÃ³rio, vai a **Settings** (Ã­cone de engrenagem)
2. No menu lateral, clica em **Pages**
3. Em "Source", seleciona **"Deploy from a branch"**
4. Em "Branch", escolhe **"main"** e a pasta **"/ (root)"**
5. Clica **Save**

### Passo 4 â€” Aceder ao site
ApÃ³s 1-2 minutos, o teu site estarÃ¡ disponÃ­vel em:
```
https://luisflmaximo.github.io/portefolio
```
(com o teu username real)

---

## âœï¸ Como atualizar conteÃºdo

### Adicionar um trabalho acadÃ©mico (PDF)
1. Coloca o ficheiro PDF na pasta `/docs/`
2. Abre o ficheiro `/pt/projetos/index.html`
3. Procura o comentÃ¡rio `EXEMPLO de como ficarÃ¡ um trabalho real`
4. Copia o bloco de exemplo, descomenta-o e preenche os dados
5. Faz o mesmo no ficheiro `/en/projects/index.html`

### Adicionar embeds do Instagram (Politiza-te)
1. Abre uma publicaÃ§Ã£o do Instagram no computador
2. Clica nos trÃªs pontos `Â·Â·Â·` e escolhe **"Incorporar"**
3. Copia o cÃ³digo HTML
4. No ficheiro `/pt/projetos/index.html`, localiza os `instagram-embed-slot`
5. Substitui o conteÃºdo do slot pelo cÃ³digo copiado
6. Faz o mesmo no ficheiro `/en/projects/index.html`

### Adicionar links na pÃ¡gina secreta
1. Abre `/secret/index.html`
2. Procura o bloco `EXEMPLO DE CARTÃƒO`
3. Copia o exemplo, descomenta-o e preenche os dados
4. Podes criar novas categorias duplicando um bloco `secret-category`

### Adicionar o LinkedIn do Politiza-te (quando disponÃ­vel)
1. Abre `/pt/projetos/index.html` e `/en/projects/index.html`
2. Localiza o botÃ£o `politizate-social--coming` do LinkedIn
3. Remove a classe `politizate-social--coming`
4. Adiciona o `href` com o link correto

---

## ðŸ” PÃ¡gina Secreta

A pÃ¡gina secreta Ã© ativada clicando **5 vezes** na fotografia de perfil da pÃ¡gina inicial.
- Funciona em mobile e PC
- NÃ£o estÃ¡ indexada nos motores de busca (tem `noindex, nofollow`)
- O URL Ã© `/secret/` â€” podes partilhar diretamente se quiseres

---

## ðŸ“± Compatibilidade
- âœ… Chrome, Firefox, Safari, Edge
- âœ… iOS Safari (iPhone/iPad)
- âœ… Android Chrome
- âœ… Responsive em todos os tamanhos de ecrÃ£

