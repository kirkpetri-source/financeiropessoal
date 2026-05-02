# Controle Financeiro Pessoal

Sistema web para controle de receitas e despesas pessoais, com login por usuário/senha, dashboard com gráficos, lançamentos manuais e integração preparada para WhatsApp via Evolution API.

---

## Tecnologias

| Camada | Stack |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + Recharts |
| Backend | Node.js + Express |
| Banco de Dados | PostgreSQL + Prisma ORM |
| Autenticação | JWT + bcryptjs |
| Validação | Zod + React Hook Form |
| Datas | date-fns (pt-BR) |

---

## Pré-requisitos

- Node.js 18+
- PostgreSQL 14+
- npm ou yarn

---

## Instalação

### 1. Clone o repositório e acesse a pasta

```bash
cd "FINANCEIRO PESSOAL"
```

### 2. Instalar e configurar o Backend

```bash
cd backend
npm install
```

Crie o arquivo `.env` baseado no `.env.example`:

```bash
cp .env.example .env
```

Edite o `.env` com seus dados:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/financeiro_pessoal"
JWT_SECRET="sua-chave-secreta-forte-aqui"
JWT_EXPIRES_IN="7d"
PORT=3001
FRONTEND_URL="http://localhost:5173"
NODE_ENV="development"
```

### 3. Criar o banco e rodar migrations

Certifique-se de que o PostgreSQL está rodando e crie o banco:

```sql
CREATE DATABASE financeiro_pessoal;
```

Execute as migrations:

```bash
npm run db:migrate
```

> Quando solicitado, dê um nome para a migration, ex: `init`

### 4. Popular o banco com dados iniciais (seed)

```bash
npm run db:seed
```

Isso cria:
- Categorias padrão (despesas e receitas)
- Formas de pagamento padrão
- Usuário administrador
- Lançamentos de exemplo para o mês atual

### 5. Iniciar o backend

```bash
npm run dev
```

O servidor estará em: `http://localhost:3001`

---

### 6. Instalar e configurar o Frontend

```bash
cd ../frontend
npm install
```

Crie o arquivo `.env`:

```bash
cp .env.example .env
```

```env
VITE_API_URL=http://localhost:3001/api
```

### 7. Iniciar o frontend

```bash
npm run dev
```

O frontend estará em: `http://localhost:5173`

---

## Acesso

Após rodar o seed, acesse com:

- **E-mail:** `admin@financeiro.local`
- **Senha:** `admin123`

---

## Endpoints principais da API

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/api/auth/login` | Login | Não |
| POST | `/api/auth/register` | Cadastro | Não |
| GET | `/api/auth/me` | Perfil do usuário | Sim |
| PUT | `/api/auth/me` | Atualizar perfil | Sim |
| PUT | `/api/auth/me/password` | Alterar senha | Sim |
| GET | `/api/transactions` | Listar lançamentos | Sim |
| GET | `/api/transactions/summary?month=2024-05` | Resumo do mês | Sim |
| POST | `/api/transactions` | Criar lançamento | Sim |
| PUT | `/api/transactions/:id` | Editar lançamento | Sim |
| DELETE | `/api/transactions/:id` | Excluir lançamento | Sim |
| GET | `/api/categories` | Listar categorias | Sim |
| POST | `/api/categories` | Criar categoria | Sim |
| PUT | `/api/categories/:id` | Editar categoria | Sim |
| DELETE | `/api/categories/:id` | Excluir categoria | Sim |
| GET | `/api/payment-methods` | Listar formas de pagamento | Sim |
| GET | `/api/whatsapp/config` | Buscar config WhatsApp | Sim |
| PUT | `/api/whatsapp/config` | Salvar config WhatsApp | Sim |
| GET | `/api/whatsapp/logs` | Listar logs de mensagens | Sim |
| POST | `/api/webhooks/evolution` | Webhook Evolution API | Não |

---

## Filtros disponíveis para `/api/transactions`

```
GET /api/transactions?month=2024-05&type=EXPENSE&categoryId=...&paymentMethodId=...&origin=WHATSAPP
```

---

## Webhook Evolution API

### URL para configurar na Evolution API

```
POST http://seu-servidor:3001/api/webhooks/evolution
```

### Exemplo de payload (Evolution API v2 — messages.upsert)

```json
{
  "event": "messages.upsert",
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "120363000000000@g.us",
      "id": "3EB01234ABCD"
    },
    "pushName": "Kirk",
    "message": {
      "conversation": "gasto mercado 84,90 pix"
    }
  }
}
```

---

## Parser de mensagens financeiras

O sistema interpreta mensagens em texto livre no formato:

```
[tipo] [descrição] [valor] [forma de pagamento]
```

### Tipos aceitos

| Palavra-chave | Tipo |
|---|---|
| `gasto`, `despesa`, `paguei` | Despesa |
| `receita`, `entrada`, `recebi` | Receita |

### Exemplos válidos

```
gasto mercado 84,90 pix
gasto almoço 35 dinheiro
despesa gasolina carro 150 credito
receita manutenção notebook 250 pix
entrada venda celular 800 dinheiro
gasto energia 245,30 pix
receita salário 4500 transferencia
```

### Mapeamento automático de categorias

Palavras-chave na descrição são usadas para sugerir a categoria:

| Palavras-chave | Categoria |
|---|---|
| mercado, supermercado | Mercado |
| gasolina, combustível, posto | Combustível |
| almoço, lanche, restaurante | Alimentação |
| energia, luz | Energia |
| internet, wifi | Internet |
| remédio, farmácia | Farmácia |
| uber, transporte, ônibus | Transporte |
| netflix, spotify, assinatura | Assinaturas |
| igreja, oferta, dízimo | Igreja/Doações |
| manutenção, conserto | Serviços/Moradia |
| venda | Vendas |

---

## Estrutura do projeto

```
FINANCEIRO PESSOAL/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Modelos do banco
│   │   └── seed.js             # Dados iniciais
│   └── src/
│       ├── config/             # Database, JWT
│       ├── controllers/        # Handlers de rota
│       ├── middlewares/        # Auth, validate, errorHandler
│       ├── routes/             # Definição de rotas
│       ├── services/           # Lógica de negócio
│       ├── utils/              # financialParser
│       ├── validators/         # Schemas Zod
│       ├── webhooks/           # evolutionWebhook
│       └── server.js
│
└── frontend/
    └── src/
        ├── components/
        │   ├── charts/         # ExpenseChart, IncomeExpenseChart
        │   ├── forms/          # TransactionForm
        │   ├── layout/         # AppLayout, Sidebar, Header
        │   └── ui/             # Modal, ConfirmDialog, EmptyState
        ├── contexts/           # AuthContext
        ├── hooks/              # useTransactions, useCategories
        ├── pages/              # Dashboard, Transactions, Categories...
        ├── routes/             # PrivateRoute
        ├── services/           # api.js (axios)
        └── utils/              # formatters.js
```

---

## Comandos úteis

```bash
# Backend
npm run dev          # Iniciar em modo desenvolvimento
npm run db:studio    # Abrir Prisma Studio (interface visual do banco)
npm run db:reset     # Resetar banco e rodar seed novamente
npm run db:generate  # Regenerar cliente Prisma após mudanças no schema

# Frontend
npm run dev          # Iniciar em modo desenvolvimento
npm run build        # Build de produção
npm run preview      # Visualizar build de produção
```

---

## Variáveis de ambiente

### Backend (`.env`)

| Variável | Descrição | Padrão |
|---|---|---|
| `DATABASE_URL` | URL de conexão PostgreSQL | — |
| `JWT_SECRET` | Segredo para assinar tokens JWT | — |
| `JWT_EXPIRES_IN` | Tempo de expiração do token | `7d` |
| `PORT` | Porta do servidor | `3001` |
| `FRONTEND_URL` | URL do frontend (CORS) | `http://localhost:5173` |
| `NODE_ENV` | Ambiente | `development` |

### Frontend (`.env`)

| Variável | Descrição | Padrão |
|---|---|---|
| `VITE_API_URL` | URL base da API | `http://localhost:3001/api` |

---

## Funcionalidades implementadas

- [x] Login com e-mail e senha (JWT)
- [x] Dashboard com resumo financeiro mensal
- [x] Cards: receitas, despesas, saldo, maior categoria
- [x] Gráfico de pizza por categoria
- [x] Gráfico de barras receitas × despesas
- [x] Lista de últimos lançamentos
- [x] CRUD completo de lançamentos com filtros
- [x] Formulário responsivo de lançamento
- [x] CRUD de categorias (padrão + personalizadas)
- [x] Formas de pagamento
- [x] Configurações do usuário (perfil + senha)
- [x] Configuração da Evolution API
- [x] Webhook Evolution API
- [x] Parser de texto financeiro
- [x] Logs de mensagens WhatsApp
- [x] Estrutura para IA (aiParserService — placeholder)
- [x] Suporte a áudio/imagem nos logs (pendente)
- [x] Layout responsivo mobile/desktop
- [x] Rate limit no login
- [x] Validação com Zod (backend) + React Hook Form (frontend)

---

## Próximos passos sugeridos

- [ ] Integrar IA (Gemini Flash) no `aiParserService` para mensagens ambíguas
- [ ] Implementar transcrição de áudio (Whisper/Gemini)
- [ ] Envio de confirmação via Evolution API após lançamento
- [ ] Relatórios mensais em PDF
- [ ] Metas financeiras por categoria
- [ ] Importação via CSV/Excel
