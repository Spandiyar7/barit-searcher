# Commodity Trading CRM MVP

Production-style, deployable MVP of an AI-powered commodity trading CRM built as a single Next.js monolith.

## Stack
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Prisma ORM
- Supabase PostgreSQL
- Zod validation
- AI abstraction layer for OpenAI / Gemini / fallback mock
- Vercel-ready deployment

## Implemented Modules
- Dashboard (KPIs, lead status breakdown, top products, recent activities)
- Companies (list/filter/create/edit/detail/delete + related contacts/leads/deals)
- Contacts (list/filter/create/edit/detail/delete + linked company)
- Products (list/filter/create/edit/detail/delete + synonyms/HS/specs + linked leads/deals)
- Leads (list/filter/create/edit/detail/delete + convert to deal + raw text + AI analysis)
- Deals (list/filter/create/edit/detail/delete + buyer/seller linking + notes)
- Activities (timeline + add from company/contact/lead/deal pages)
- Global Search (tokenized multi-entity search)
- AI Lead Analyzer / Market Intelligence page

## Project Structure
```txt
app/
  (dashboard)/
    dashboard/
    companies/
    contacts/
    products/
    leads/
    deals/
    search/
    intelligence/
  api/
components/
  layout/
  ui/
  companies/
  contacts/
  products/
  leads/
  deals/
  activities/
  search/
  dashboard/
lib/
  ai/
  db/
  services/
  utils/
  validations/
prisma/
  schema.prisma
  seed.ts
types/
```

## Environment Variables
Use `.env.example` as template:

```env
DATABASE_URL="postgresql://postgres:password@db.<project-ref>.supabase.co:5432/postgres"
DIRECT_URL="postgresql://postgres:password@db.<project-ref>.supabase.co:5432/postgres"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
AI_PROVIDER="openai"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4.1-mini"
GEMINI_API_KEY=""
MARKET_FALLBACK_SEARCH_PROVIDER="auto"
BRAVE_SEARCH_API_KEY=""
```

## Local Setup
1. Install dependencies:
```bash
npm install
```

2. Copy env file and fill values:
```bash
cp .env.example .env
```

3. Generate Prisma client:
```bash
npm run prisma:generate
```

4. Run migration:
```bash
npm run prisma:migrate -- --name init
```

5. Seed realistic CRM data:
```bash
npm run prisma:seed
```

6. Start dev server:
```bash
npm run dev
```

7. Open app:
- [http://localhost:3000](http://localhost:3000)

## Supabase Setup (Exact Flow)
1. Create a new Supabase project.
2. Go to `Project Settings -> Database -> Connection string`.
3. Copy:
- Direct connection URI -> `DATABASE_URL`
- Same direct connection URI -> `DIRECT_URL`
4. Put both values into `.env`.
5. Run:
```bash
npm run prisma:migrate -- --name init
npm run prisma:seed
```

## AI Provider Configuration
`AI_PROVIDER` supports:
- `openai` (default, uses `OPENAI_MODEL`=`gpt-4.1-mini` unless overridden)
- `gemini` (requires `GEMINI_API_KEY`)
- `mock` (manual fallback mode)

Market intelligence anti-block fallback:
- `MARKET_FALLBACK_SEARCH_PROVIDER`: `auto` (default), `brave`, or `duckduckgo`
- `BRAVE_SEARCH_API_KEY` (optional; if set, Brave Search API is used first, then DuckDuckGo fallback)

Implemented interface:
- `parseLeadText(rawText)`
- `summarizeLead(input)`
- `suggestNextActions(input)`

If API key is missing, app still works using fallback behavior.

## Vercel Deployment
1. Push repository to GitHub/GitLab/Bitbucket.
2. Import project in Vercel.
3. Add environment variables in Vercel project settings:
- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_APP_URL`
- `AI_PROVIDER`
- `OPENAI_API_KEY` (optional)
- `GEMINI_API_KEY` (optional)
4. Deploy.
5. Run production migrations once against Supabase:
```bash
npm run prisma:deploy
```
6. Optional seed for production/demo data:
```bash
npm run prisma:seed
```

## Useful Scripts
```bash
npm run dev
npm run build
npm run start
npm run lint
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
npm run prisma:seed
```

## Server-Side Validation
- CI workflow: `.github/workflows/server-validation.yml`
- Runs on push/PR with Node 20:
1. `npm ci`
2. `npx prisma generate`
3. `npm run lint`
4. `npm run build`

Use this workflow (or Northflank build pipeline) when local Node/NPM is unavailable.

## Notes
- This MVP intentionally supports manual CRM inputs and AI analysis of user-provided text.
- No scraping, CAPTCHA bypass, stealth automation, or unrestricted crawling is implemented.
- Search is designed for Prisma + token matching now, with clean extension path for vector/semantic search later.
