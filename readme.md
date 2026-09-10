# AnimaPlay - Catálogo de Animes

## Sobre o Projeto
Este é um site de catálogo de animes com um visual moderno em estilo "streaming" (grade de cards escuros com pôsteres), hospedado de forma gratuita no GitHub Pages.

## Stack Tecnológica
- **Front-end:** HTML5 e CSS3 puro (com foco em Grid Responsivo).
- **Gerenciamento de Conteúdo (CMS):** Decap CMS (configurado na rota `/admin`). Permite gerenciar postagens de novos animes e episódios através de um painel autenticado pelo GitHub, sem precisar alterar códigos manualmente no dia a dia.
- **Hospedagem:** GitHub Pages (`https://animaplay.github.io/animaplay/`).

## Estrutura de Arquivos
- `index.html`: Página principal que exibe o catálogo visual.
- `style.css`: Folha de estilos customizada para o design dos cards.
- `admin/index.html`: Arquivo de carregamento da interface administrativa do Decap CMS.
- `admin/config.yml`: Configuração dos campos de cadastro de animes e integração com o repositório GitHub.

## Próximos Passos Pendentes (Contexto Futuro)
- Subir os arquivos para o repositório no GitHub (`animaplays/animaplay`).
- Ativar a autenticação via OAuth/Netlify Identity (ou GitHub App) para proteger o acesso à rota `/admin`.
- Automatizar a leitura dos arquivos de conteúdo gerados pelo CMS na página principal (`index.html`) via JavaScript.