# 🦁 Lion Tech — Landing Page

Landing page profissional da **Lion Tech Soluções em TI** (Mineiros-GO): assistência técnica de computadores, notebooks e celulares, limpeza de PC gamer, upgrades e loja de informática/eletrônicos.

Feita com **React + Vite + Tailwind CSS + Framer Motion** (animações de scroll trigger), pronta para deploy na **Vercel**.

---

## ▶️ Rodar localmente

```bash
cd liontech-landing
npm install
npm run dev
```

Abra http://localhost:5173

Para gerar a versão de produção:

```bash
npm run build     # gera a pasta dist/
npm run preview   # testa a build localmente
```

---

## ✏️ Onde editar cada coisa

### 1. WhatsApp, Instagram, endereço e mensagens → `src/config.js`

Esse é o **único arquivo de configuração**. Edite:

```js
export const WHATSAPP_NUMBER = 'SEU_NUMERO_AQUI' // ex.: '5564999550000'
```

- `WHATSAPP_NUMBER` — número no formato internacional (55 + DDD + número, só dígitos)
- `INSTAGRAM_USER` — usuário do Instagram (sem @)
- `COMPANY_ADDRESS` — endereço exibido no site
- `WHATSAPP_MESSAGES` — as mensagens pré-preenchidas de cada botão
- `GOOGLE_MAPS_URL` / `GOOGLE_MAPS_EMBED_URL` — gerados automaticamente a partir do endereço

### 2. Textos das seções → `src/components/`

Cada seção da página é um componente separado:

| Seção | Arquivo |
|---|---|
| Menu fixo | `src/components/Navbar.jsx` |
| Hero (abertura) | `src/components/Hero.jsx` |
| Agendamento rápido | `src/components/QuickSchedule.jsx` |
| Serviços (cards) | `src/components/Services.jsx` |
| Antes e Depois + slider | `src/components/BeforeAfter.jsx` |
| Slider comparativo (arrastável) | `src/components/CompareSlider.jsx` |
| Por que a Lion Tech | `src/components/WhyLionTech.jsx` |
| Processo (linha do tempo animada) | `src/components/Process.jsx` |
| Loja / vendas | `src/components/Products.jsx` |
| Confiança | `src/components/Trust.jsx` |
| Localização + mapa | `src/components/Location.jsx` |
| CTA final | `src/components/FinalCTA.jsx` |
| Rodapé | `src/components/Footer.jsx` |
| Botão flutuante do WhatsApp | `src/components/WhatsAppFloat.jsx` |

### 3. Imagens → `src/assets/placeholders/`

Os placeholders atuais são SVGs escuros com o texto "FOTO REAL: ...". **Substitua pelos arquivos reais mantendo os mesmos nomes** (pode usar `.jpg`/`.png` — nesse caso ajuste a extensão nos `import` de `BeforeAfter.jsx` e `Location.jsx`):

| Arquivo | O que colocar |
|---|---|
| `antes-1.svg` / `depois-1.svg` | Gabinete completo antes/depois da limpeza (slider principal) |
| `antes-2.svg` / `depois-2.svg` | Coolers/placa de vídeo antes/depois |
| `antes-3.svg` / `depois-3.svg` | Fonte/gabinete antes/depois |
| `loja.svg` | Fachada da loja em Mineiros-GO |

**Dica:** fotos em paisagem, ~1200×750px, comprimidas (use [squoosh.app](https://squoosh.app)). Pares antes/depois ficam melhores fotografados do mesmo ângulo.

📸 **Lista de fotos recomendadas para tirar na loja:**
1. Fachada da loja (dia)
2. Bancada de trabalho com equipamento aberto
3. PC gamer empoeirado (antes) — gabinete aberto
4. Mesmo PC limpo (depois) — mesmo ângulo
5. Cooler/placa de vídeo com poeira × limpo
6. Fonte suja × limpa
7. Vitrine de produtos/acessórios
8. Equipe atendendo um cliente

### 4. Cores e fontes → `tailwind.config.js`

A paleta está em `theme.extend.colors` (`night` = fundos, `neon` = destaques roxo/azul/ciano). Se conseguir as cores oficiais da marca, troque os valores hex ali — o site inteiro acompanha.

### 5. SEO (título, descrição, dados estruturados) → `index.html`

Meta title, meta description, Open Graph e o JSON-LD de empresa local estão todos no `<head>` do `index.html`.

---

## 🚀 Publicar na Vercel

**Opção A — pelo site da Vercel (recomendado):**
1. Suba o projeto para um repositório no GitHub
2. Acesse [vercel.com](https://vercel.com) → **Add New → Project** → importe o repositório
3. Em **Root Directory**, selecione `liontech-landing` (importante, pois a landing está numa subpasta)
4. A Vercel detecta Vite automaticamente (build `npm run build`, saída `dist/`) → **Deploy**

**Opção B — pela linha de comando:**

```bash
npm i -g vercel
cd liontech-landing
vercel          # preview
vercel --prod   # produção
```

Depois é só apontar o domínio (ex.: `liontechti.com.br`) nas configurações do projeto na Vercel.

---

## 📁 Estrutura de pastas

```
liontech-landing/
├── index.html              # SEO: title, description, OG, JSON-LD
├── vercel.json             # Configuração de deploy da Vercel
├── tailwind.config.js      # Paleta de cores e fontes
├── public/
│   ├── favicon.svg
│   └── og-image.svg        # Imagem de compartilhamento (troque por PNG real se quiser)
└── src/
    ├── config.js           # ⭐ WhatsApp, Instagram, endereço, mensagens
    ├── main.jsx            # Entrada do React
    ├── App.jsx             # Ordem das seções da página
    ├── index.css           # Estilos globais (botões neon, glass cards)
    ├── assets/
    │   └── placeholders/   # 📷 Troque pelos arquivos reais
    └── components/
        ├── ui/             # Reveal (scroll trigger) e SectionHeader
        └── *.jsx           # Uma seção por arquivo
```

---

## ℹ️ Dados usados

Informações públicas verificadas: razão social **Lion Tech Soluções em TI LTDA**, endereço **Segunda Avenida, nº 87, Qd. 66 Lt. 03 — Centro, Mineiros-GO, 75830-082**, Instagram **@liontechti** e site **liontechti.com.br**. Nenhum depoimento, avaliação ou número foi inventado. Confirme o endereço/horários antes de publicar.
