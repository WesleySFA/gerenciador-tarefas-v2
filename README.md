# Gerenciador de Tarefas

Sistema completo de gerenciamento de tarefas com autenticação de usuários, visão Kanban, prioridades e prazos. Projeto desenvolvido para a matéria de Projeto de Software.

## Funcionalidades

- **Autenticação de usuários** — Registro e login com JWT
- **CRUD completo** — Criar, listar, atualizar e deletar tarefas
- **Visão Kanban** — Quadro com colunas Pendente / Em Andamento / Concluída
- **Visão em lista** — Visualização tradicional com filtros por status
- **Prioridade** — Alta, média ou baixa com indicadores visuais
- **Prazo** — Data limite com alerta visual de atraso
- **Busca** — Filtro por título ou descrição
- **Drag & Drop** — Arrastar tarefas entre colunas no Kanban
- **Reordenação** — Mover tarefas para cima/baixo na lista
- **Sanitização** — Proteção contra XSS nos inputs
- **Dados persistentes** — Armazenamento em MySQL

## Arquitetura (3 Camadas)

| Camada | Tecnologia |
|--------|------------|
| **Front-end** | HTML, CSS, JavaScript (Vanilla) |
| **Back-end** | Node.js + Express |
| **Banco de Dados** | MySQL |

## Pré-requisitos

- Node.js v14+
- MySQL 5.7+
- npm

## Instalação

```bash
git clone https://github.com/WesleySFA/gerenciador-tarefas.git
cd gerenciador-tarefas
npm install
```

### Configuração

Copie o arquivo `.env.example` para `.env` e ajuste as credenciais:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=tarefas_db
JWT_SECRET=sua-chave-secreta
PORT=3000
```

Crie o banco de dados manualmente (opcional, o servidor cria automaticamente):

```sql
CREATE DATABASE tarefas_db;
```

### Iniciar

```bash
npm start
```

Acesse em [http://localhost:3000](http://localhost:3000)

## Estrutura do Projeto

```
gerenciador-tarefas/
├── public/
│   ├── index.html    # Página principal (auth + tarefas)
│   ├── styles.css    # Estilos CSS
│   └── script.js     # Lógica do front-end
├── index.js          # Servidor Node.js (back-end)
├── .env.example      # Exemplo de variáveis de ambiente
├── package.json      # Dependências do projeto
└── README.md         # Documentação
```

## API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/register` | Registrar novo usuário |
| POST | `/login` | Autenticar usuário |
| GET | `/me` | Dados do usuário logado |
| GET | `/tasks` | Listar tarefas do usuário |
| POST | `/tasks` | Criar nova tarefa |
| PUT | `/tasks/:id` | Atualizar tarefa (status, prioridade, prazo, ordem) |
| DELETE | `/tasks/:id` | Excluir tarefa |

## Tecnologias

- [Express](https://expressjs.com/)
- [MySQL2](https://github.com/sidorares/node-mysql2)
- [JSON Web Token](https://jwt.io/)
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js)
- [dotenv](https://github.com/motdotla/dotenv)

## Cronograma de Entregas

| Entrega | Data | Status |
|---------|------|--------|
| 1ª AC | 15/03 | ✅ Concluída |
| 2ª AC | 12/04 | ✅ Concluída |
| 3ª AC | 10/05 | ✅ Concluída |
| Entrega Final | 07/06 | 📝 Pendente |

## Equipe

- Wesley Silva Ferreira Amaro ([WesleySFA](https://github.com/WesleySFA))

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE) para mais informações.
