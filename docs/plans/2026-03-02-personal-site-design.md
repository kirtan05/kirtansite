# kirtanjain.com — Design Document

**Date:** 2026-03-02
**Status:** Approved

## Overview

Personal website for Kirtan Jain — a hub-style bento grid homepage with sub-pages, dark theme, bold typography, and polished animations. Serves recruiters, developer peers, and anyone discovering Kirtan online.

## Visual Identity

### Typography
- **Headlines:** Clash Display (bold, geometric)
- **Body:** Satoshi (clean, modern, high readability on dark backgrounds)
- **Code/accents:** JetBrains Mono

### Color Palette
- Background: `#0A0A0A` (near-black)
- Card surface: `#141414` with `#1A1A1A` borders
- Primary text: `#EDEDED` (warm off-white)
- Secondary text: `#888888`
- Accent: `#F59E0B` (amber)
- Accent hover: `#FBBF24`
- Background texture: SVG grain overlay at 3-5% opacity

### Card Treatment
- Frosted glass: `backdrop-filter: blur(12px)` with `border-top: 0.5px solid rgba(255,255,255,0.05)`
- 3D cursor-tracking tilt (vanilla JS, max 3-5 degrees)
- Hover: subtle scale (1.02x) + amber border glow

## Pages

### Homepage (`/`)
Bento grid hub with asymmetric cards:
- **Hero card** (largest): Name in Clash Display + animated tagline cycling `builder. engineer. researcher. quizzer.` — animates once on load, cycles only on hover
- **Photo card**: High-quality photo with subtle parallax
- **Projects card**: Featured project (OneIITP), links to /projects
- **Now card**: Current role — "R&D Engineer @ Samsung"
- **Research card**: "CIKM '25 · EMNLP '24", links to /research
- **Stats card**: Codeforces 1805, ICPC Finalist, 2000+ users
- **Connect card**: GitHub, LinkedIn, Email, Resume download

### Projects (`/projects`)
- Grid of project cards (name, description, tech tags, thumbnail)
- Projects: OneIITP, Alloc8, Sprinklr middleware
- Cards fade in on scroll via GSAP stagger

### Research (`/research`)
- Clean card layout for publications
- Papers: CIKM '25 (CoD-V / VideoLLama2), EMNLP '24 (M3Hop-CoT)
- Each: title, venue, description, arXiv link

### About (`/about`)
- Photo + narrative paragraphs
- Experience timeline: Samsung (current), Sprinklr (intern)
- Education: IIT Patna, B.Tech CS
- Achievements: ICPC, Codeforces Expert, KVPY, JEE Advanced AIR 2194, Gen Sec Technical
- Quizzing: one-line mention (NTPC Electron, Nihilanth @ IIM Calcutta)

## Animations

- **Page load:** GSAP timeline — cards stagger in (fade up + Y-translate, 0.1s delay)
- **Page transitions:** Astro View Transitions API (cross-fade/slide)
- **Hero tagline:** SplitText character animation, plays once on load, resumes on hover
- **Card hover:** 3D tilt (cursor-tracking) + amber glow
- **Scroll:** GSAP ScrollTrigger for content reveals on sub-pages
- **Background:** SVG grain texture overlay

## Tech Stack

- **Framework:** Astro 5 (static, zero JS by default, View Transitions built-in)
- **Styling:** Tailwind CSS 4 (custom design tokens, not defaults)
- **Animations:** GSAP (ScrollTrigger + SplitText) + vanilla JS (card tilt)
- **Language:** TypeScript
- **Fonts:** Self-hosted (Clash Display, Satoshi, JetBrains Mono)

## Project Structure

```
kjsite/
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── components/
│   │   ├── BentoGrid.astro
│   │   ├── BentoCard.astro
│   │   ├── Hero.astro
│   │   ├── ProjectCard.astro
│   │   ├── PaperCard.astro
│   │   ├── Timeline.astro
│   │   ├── Navbar.astro
│   │   ├── Footer.astro
│   │   └── GrainOverlay.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── projects.astro
│   │   ├── research.astro
│   │   └── about.astro
│   ├── styles/
│   │   └── global.css
│   └── data/
│       ├── projects.ts
│       ├── papers.ts
│       └── experience.ts
├── public/
│   ├── fonts/
│   └── images/
├── astro.config.mjs
├── tailwind.config.mjs
├── tsconfig.json
└── package.json
```

## Deployment

- **Host:** Vercel
- **CI/CD:** GitHub repo (kirtan05/kirtansite) connected to Vercel
- **Auto-deploy:** Push to `main`
- **Preview deploys:** On PRs
- **Custom domain:** kirtanjain.com
- **Build:** `astro build` → `dist/`

## Performance Targets

- Lighthouse 95+ all categories
- < 1s First Contentful Paint
- Zero JS on static pages
- GSAP code-split via Astro islands

## Future Expansion (Not in v1)

- Blog with MDX support
- Quizzing section (trivia, questions curated by Kirtan)
- Interactive quiz element
- Project case studies with detailed write-ups
