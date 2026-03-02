# kirtanjain.com Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use frontend-design:frontend-design skill when building visual components for high design quality.

**Goal:** Build a dark, bold, bento-grid personal site for Kirtan Jain with polished GSAP animations, deployed via Vercel CI/CD.

**Architecture:** Astro 5 static site with Tailwind CSS 4 (CSS-based config via @theme), GSAP for scroll/load animations, View Transitions for page navigation. Self-hosted fonts (Clash Display, Satoshi, JetBrains Mono). Bento grid homepage hub linking to /projects, /research, /about sub-pages.

**Tech Stack:** Astro 5, Tailwind CSS 4, GSAP (ScrollTrigger), TypeScript, Vercel

**Git identity:** All commits must be authored by kirtan05. Do NOT add Co-Authored-By headers.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/pages/index.astro`

**Step 1: Initialize Astro project**

Run from `/home/kirtan/Desktop/2026_Projects/kjsite`:

```bash
npm create astro@latest . -- --template minimal --install --typescript strict --git
```

If prompted about existing files (resumes/, docs/), allow overwrite of only Astro scaffold files. The `.` installs in the current directory.

**Step 2: Add Tailwind CSS 4**

```bash
npx astro add tailwind
```

This installs `tailwindcss` and `@tailwindcss/vite`. It will update `astro.config.mjs` to use the Vite plugin. Accept all prompts.

> **Note:** Tailwind CSS 4 does NOT use `tailwind.config.mjs`. All config is done via `@theme` in CSS.

**Step 3: Add Vercel adapter**

```bash
npx astro add vercel
```

Accept prompts. This installs `@astrojs/vercel` and sets `adapter: vercel()` in config.

**Step 4: Install GSAP**

```bash
npm install gsap
```

**Step 5: Verify astro.config.mjs**

The file should look like:

```js
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

export default defineConfig({
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
});
```

If `npx astro add tailwind` created a different structure (e.g., using the old `@astrojs/tailwind` integration), manually update to use `@tailwindcss/vite` as shown above.

**Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: Astro dev server at http://localhost:4321

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Astro 5 with Tailwind CSS 4, GSAP, Vercel adapter"
```

---

## Task 2: Fonts & Design Tokens

**Files:**
- Create: `public/fonts/` (font files)
- Create: `src/styles/global.css`

**Step 1: Download fonts**

Download from Fontshare and JetBrains GitHub. Place woff2 files in `public/fonts/`:

```
public/fonts/
├── ClashDisplay-Semibold.woff2
├── ClashDisplay-Bold.woff2
├── Satoshi-Regular.woff2
├── Satoshi-Medium.woff2
├── Satoshi-Bold.woff2
├── JetBrainsMono-Regular.woff2
```

Sources:
- Clash Display: https://www.fontshare.com/fonts/clash-display (download ZIP, extract woff2 from webfonts folder)
- Satoshi: https://www.fontshare.com/fonts/satoshi (same process)
- JetBrains Mono: https://github.com/JetBrains/JetBrainsMono/tree/master/fonts/webfonts/

All fonts are free for commercial use (ITF FFL / SIL OFL).

**Step 2: Create global.css with @font-face and @theme**

Create `src/styles/global.css`:

```css
@import "tailwindcss";

/* === Font Faces === */
@font-face {
  font-family: 'ClashDisplay';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('/fonts/ClashDisplay-Semibold.woff2') format('woff2');
}

@font-face {
  font-family: 'ClashDisplay';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/ClashDisplay-Bold.woff2') format('woff2');
}

@font-face {
  font-family: 'Satoshi';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/Satoshi-Regular.woff2') format('woff2');
}

@font-face {
  font-family: 'Satoshi';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/Satoshi-Medium.woff2') format('woff2');
}

@font-face {
  font-family: 'Satoshi';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/Satoshi-Bold.woff2') format('woff2');
}

@font-face {
  font-family: 'JetBrainsMono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/JetBrainsMono-Regular.woff2') format('woff2');
}

/* === Tailwind CSS 4 Theme === */
@theme {
  /* Typography */
  --font-sans: 'Satoshi', ui-sans-serif, system-ui, sans-serif;
  --font-display: 'ClashDisplay', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrainsMono', ui-monospace, monospace;

  /* Colors */
  --color-bg: #0A0A0A;
  --color-surface: #141414;
  --color-border: #1A1A1A;
  --color-text: #EDEDED;
  --color-text-secondary: #888888;
  --color-accent: #F59E0B;
  --color-accent-hover: #FBBF24;
}

/* === Base Styles === */
html {
  background-color: var(--color-bg);
  color: var(--color-text);
  scroll-behavior: smooth;
}

body {
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

::selection {
  background-color: var(--color-accent);
  color: var(--color-bg);
}
```

**Step 3: Verify fonts render**

Update `src/pages/index.astro` temporarily:

```astro
---
import '../styles/global.css';
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preload" href="/fonts/ClashDisplay-Semibold.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/Satoshi-Regular.woff2" as="font" type="font/woff2" crossorigin />
    <title>Kirtan Jain</title>
  </head>
  <body class="bg-bg text-text">
    <h1 class="font-display text-4xl font-semibold text-accent">Clash Display</h1>
    <p class="font-sans text-lg">Satoshi body text</p>
    <code class="font-mono text-sm">JetBrains Mono</code>
  </body>
</html>
```

Run `npm run dev` and verify all three fonts render correctly at localhost:4321.

**Step 4: Commit**

```bash
git add public/fonts/ src/styles/global.css src/pages/index.astro
git commit -m "feat: add self-hosted fonts and Tailwind design tokens"
```

---

## Task 3: Base Layout + Grain Overlay

**Files:**
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/components/GrainOverlay.astro`
- Create: `src/components/Navbar.astro`
- Create: `src/components/Footer.astro`

**Step 1: Create GrainOverlay component**

Create `src/components/GrainOverlay.astro`:

```astro
---
// SVG noise texture overlay for organic depth
---
<div class="pointer-events-none fixed inset-0 z-50 opacity-[0.03]" aria-hidden="true">
  <svg width="100%" height="100%">
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#grain)" />
  </svg>
</div>
```

**Step 2: Create Navbar component**

Create `src/components/Navbar.astro`:

A minimal top nav with site name and page links. Style: fixed top, frosted glass background, amber accent on active link.

```astro
---
const currentPath = Astro.url.pathname;
const links = [
  { href: '/', label: 'Home' },
  { href: '/projects', label: 'Projects' },
  { href: '/research', label: 'Research' },
  { href: '/about', label: 'About' },
];
---
<nav class="fixed top-0 left-0 right-0 z-40 border-b border-border/50 backdrop-blur-xl bg-bg/80">
  <div class="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
    <a href="/" class="font-display text-lg font-semibold text-text hover:text-accent transition-colors">
      KJ
    </a>
    <div class="flex gap-6">
      {links.map(link => (
        <a
          href={link.href}
          class:list={[
            'text-sm font-medium transition-colors',
            currentPath === link.href ? 'text-accent' : 'text-text-secondary hover:text-text'
          ]}
        >
          {link.label}
        </a>
      ))}
    </div>
  </div>
</nav>
```

**Step 3: Create Footer component**

Create `src/components/Footer.astro`:

```astro
---
const socials = [
  { href: 'https://github.com/kirtan05', label: 'GitHub' },
  { href: 'https://linkedin.com/in/kirtan-jain', label: 'LinkedIn' },
  { href: 'mailto:kirtanjain0504@gmail.com', label: 'Email' },
];
---
<footer class="border-t border-border/50 py-8 mt-20">
  <div class="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
    <p class="text-text-secondary text-sm">Kirtan Jain</p>
    <div class="flex gap-6">
      {socials.map(s => (
        <a
          href={s.href}
          target={s.href.startsWith('mailto') ? undefined : '_blank'}
          rel={s.href.startsWith('mailto') ? undefined : 'noopener noreferrer'}
          class="text-sm text-text-secondary hover:text-accent transition-colors"
        >
          {s.label}
        </a>
      ))}
    </div>
  </div>
</footer>
```

**Step 4: Create BaseLayout**

Create `src/layouts/BaseLayout.astro`:

```astro
---
import { ClientRouter } from 'astro:transitions';
import '../styles/global.css';
import GrainOverlay from '../components/GrainOverlay.astro';
import Navbar from '../components/Navbar.astro';
import Footer from '../components/Footer.astro';

interface Props {
  title?: string;
  description?: string;
}

const { title = 'Kirtan Jain', description = 'Builder. Engineer. Researcher. Quizzer.' } = Astro.props;
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <meta name="author" content="Kirtan Jain" />

    <!-- Open Graph -->
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://kirtanjain.com" />

    <!-- Preload critical fonts -->
    <link rel="preload" href="/fonts/ClashDisplay-Semibold.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/Satoshi-Regular.woff2" as="font" type="font/woff2" crossorigin />

    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>{title}</title>
    <ClientRouter />
  </head>
  <body class="bg-bg text-text min-h-screen">
    <GrainOverlay />
    <Navbar />
    <main class="pt-20">
      <slot />
    </main>
    <Footer />
  </body>
</html>
```

**Step 5: Update index.astro to use layout**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="Kirtan Jain">
  <div class="mx-auto max-w-6xl px-6 py-20">
    <h1 class="font-display text-5xl font-semibold">Kirtan Jain</h1>
    <p class="text-text-secondary mt-4">Site coming together...</p>
  </div>
</BaseLayout>
```

**Step 6: Verify layout renders**

Run `npm run dev`. Check: grain overlay visible (subtle), navbar at top with frosted glass, footer at bottom, fonts correct.

**Step 7: Commit**

```bash
git add src/layouts/ src/components/ src/pages/index.astro
git commit -m "feat: add base layout with navbar, footer, grain overlay, view transitions"
```

---

## Task 4: Data Layer

**Files:**
- Create: `src/data/projects.ts`
- Create: `src/data/papers.ts`
- Create: `src/data/experience.ts`

**Step 1: Create project data**

Create `src/data/projects.ts`:

```ts
export interface Project {
  title: string;
  description: string;
  longDescription?: string;
  tech: string[];
  links: { label: string; href: string }[];
  featured?: boolean;
}

export const projects: Project[] = [
  {
    title: 'OneIITP',
    description: 'Unified campus companion app for IIT Patna — live bus tracking, marketplace, events.',
    longDescription: 'Developed the campus companion app serving 2000+ active students. Integrates live bus tracking, marketplace, and event updates into a scalable React Native platform.',
    tech: ['React Native', 'TypeScript', 'Firebase'],
    links: [
      { label: 'Play Store', href: '#' },
      { label: 'App Store', href: '#' },
    ],
    featured: true,
  },
  {
    title: 'Alloc8',
    description: 'Room allocation portal — 3000 students into 1400 rooms in minutes.',
    longDescription: 'Led development of a portal streamlining hostel room allocation. Redis-based distributed locks ensure atomic room selection. Hosted on AWS Lightsail with Caddy load-balancing.',
    tech: ['React', 'Node.js', 'MongoDB', 'Redis', 'AWS'],
    links: [
      { label: 'Website', href: '#' },
    ],
    featured: true,
  },
  {
    title: 'Sprinklr Middleware',
    description: 'API caching middleware — slashed local dev latency by 50%.',
    longDescription: 'Architected a middleware solution to capture and mock GraphQL/REST API responses. Converted into a reusable npm package adopted across multiple teams.',
    tech: ['TypeScript', 'GraphQL', 'npm'],
    links: [],
    featured: true,
  },
];
```

**Step 2: Create research data**

Create `src/data/papers.ts`:

```ts
export interface Paper {
  title: string;
  venue: string;
  year: number;
  description: string;
  links: { label: string; href: string }[];
}

export const papers: Paper[] = [
  {
    title: 'When Words Can\'t Capture It All: Video-Based User Complaint Generation',
    venue: 'CIKM',
    year: 2025,
    description: 'Defined CoD-V, a novel multimodal task for automated technical support reporting. Fine-tuned VideoLLama2 with MultiModal RAG on the curated ComVID benchmark (1,176 annotated videos).',
    links: [
      { label: 'arXiv', href: '#' },
    ],
  },
  {
    title: 'M3Hop-CoT: Misogynous Meme Identification',
    venue: 'EMNLP',
    year: 2024,
    description: 'Proposed a Chain-of-Thought framework for detecting multimodal hate speech. Three-hop prompting strategy (Emotion, Target, Context) significantly outperformed unimodal baselines.',
    links: [
      { label: 'arXiv', href: '#' },
    ],
  },
];
```

**Step 3: Create experience data**

Create `src/data/experience.ts`:

```ts
export interface Experience {
  company: string;
  role: string;
  period: string;
  location: string;
  description: string[];
  current?: boolean;
}

export const experiences: Experience[] = [
  {
    company: 'Samsung Research Institute',
    role: 'R&D Engineer',
    period: 'Jul 2025 – Present',
    location: 'Noida, India',
    description: [
      'Maintaining and optimizing Android Framework components (Multi-window, PiP, Samsung DeX) for OneUI 8.5 & 9.0.',
      'Enhancing system stability across foldable flagships while ensuring seamless AOSP integration.',
    ],
    current: true,
  },
  {
    company: 'Sprinklr',
    role: 'Product Engineering Intern',
    period: 'May 2024 – Jul 2024',
    location: 'Gurgaon, India',
    description: [
      'Architected API caching middleware that slashed local development latency by 50%.',
      'Converted caching mechanism into a reusable npm package adopted across multiple teams.',
    ],
  },
];

export interface Achievement {
  text: string;
  highlight?: string;
}

export const achievements: Achievement[] = [
  { text: 'ICPC India Regional Finalist 2024 (Amritapuri)', highlight: 'ICPC' },
  { text: 'Codeforces Expert (Max: 1805)', highlight: '1805' },
  { text: 'KVPY Fellowship (SA-2019, SX-2020)', highlight: 'KVPY' },
  { text: 'JEE Advanced AIR 2194 (Top 1.5% of 150,000+)', highlight: 'AIR 2194' },
  { text: 'General Secretary, Technical — Student Gymkhana \'24-25', highlight: 'Gen Sec' },
  { text: 'Overall Events Head, Inter-IIT Cultural Meet 7.0' },
  { text: 'National Finalist, NTPC Electron Quiz. General Quiz Finalist at Nihilanth (IIM Calcutta).' },
];

export const education = {
  institution: 'Indian Institute of Technology, Patna',
  degree: 'B.Tech in Computer Science and Technology',
  period: '2021 – 2025',
  cpi: '7.52/10',
};
```

**Step 4: Commit**

```bash
git add src/data/
git commit -m "feat: add structured data for projects, research papers, experience"
```

---

## Task 5: Homepage Bento Grid

> **Note:** Use the `frontend-design:frontend-design` skill when implementing this task for high design quality.

**Files:**
- Create: `src/components/BentoCard.astro`
- Create: `src/components/BentoGrid.astro`
- Create: `src/components/Hero.astro`
- Modify: `src/pages/index.astro`

**Step 1: Create BentoCard component**

Create `src/components/BentoCard.astro`:

A reusable card with frosted glass, border glow on hover, and a data attribute for GSAP animation targeting. The 3D tilt will be added via client-side JS in a later task.

```astro
---
interface Props {
  href?: string;
  class?: string;
  span?: 'full' | 'half' | 'third';
}

const { href, class: className = '', span = 'half' } = Astro.props;

const spanClasses = {
  full: 'md:col-span-2',
  half: 'md:col-span-1',
  third: 'md:col-span-1',
};

const Tag = href ? 'a' : 'div';
---
<Tag
  href={href}
  class:list={[
    'group relative rounded-2xl border border-border/50 bg-surface/80 p-6',
    'backdrop-blur-xl transition-all duration-300',
    'hover:border-accent/20 hover:shadow-[0_0_30px_-5px_rgba(245,158,11,0.1)]',
    'data-[animate]:opacity-0 data-[animate]:translate-y-6',
    spanClasses[span],
    className,
  ]}
  data-animate
  data-tilt
  style="border-top: 0.5px solid rgba(255,255,255,0.05);"
>
  <slot />
</Tag>
```

**Step 2: Create Hero component**

Create `src/components/Hero.astro`:

```astro
---
// Hero section with name and animated tagline
---
<div class="space-y-4">
  <h1 class="font-display text-5xl md:text-7xl font-bold tracking-tight">
    Kirtan Jain
  </h1>
  <div class="flex items-center gap-2 text-text-secondary text-lg md:text-xl" id="hero-tagline">
    <span class="tagline-word" data-words='["builder", "engineer", "researcher", "quizzer"]'>builder</span>
    <span class="text-accent">.</span>
  </div>
</div>
```

**Step 3: Create BentoGrid (the homepage hub)**

Create `src/components/BentoGrid.astro`:

This assembles all the bento cards into the asymmetric grid. Import data from the data layer.

```astro
---
import BentoCard from './BentoCard.astro';
import Hero from './Hero.astro';
import { projects } from '../data/projects';
import { papers } from '../data/papers';
---
<section class="mx-auto max-w-6xl px-6 py-12 md:py-20">
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

    <!-- Hero Card (spans 2 cols) -->
    <BentoCard span="full" class="md:col-span-2 flex items-end min-h-[280px]">
      <Hero />
    </BentoCard>

    <!-- Photo Card -->
    <BentoCard class="min-h-[280px] flex items-center justify-center overflow-hidden">
      <div class="text-text-secondary text-sm text-center">
        <!-- Replace with actual photo -->
        <div class="w-32 h-32 rounded-full bg-border/50 mx-auto mb-3"></div>
        <p class="font-mono text-xs text-text-secondary">photo coming soon</p>
      </div>
    </BentoCard>

    <!-- Projects Card -->
    <BentoCard href="/projects">
      <div class="flex flex-col justify-between h-full min-h-[180px]">
        <div>
          <p class="text-xs font-mono text-accent uppercase tracking-wider mb-2">Projects</p>
          <h3 class="font-display text-xl font-semibold">{projects[0].title}</h3>
          <p class="text-text-secondary text-sm mt-1">{projects[0].description}</p>
        </div>
        <span class="text-accent text-sm mt-4 group-hover:translate-x-1 transition-transform">View all &rarr;</span>
      </div>
    </BentoCard>

    <!-- Now Card -->
    <BentoCard>
      <div class="min-h-[180px] flex flex-col justify-between">
        <div>
          <p class="text-xs font-mono text-accent uppercase tracking-wider mb-2">Now</p>
          <h3 class="font-display text-xl font-semibold">R&D Engineer</h3>
          <p class="text-text-secondary text-sm mt-1">Samsung Research Institute</p>
          <p class="text-text-secondary text-xs mt-2">Android Framework · OneUI · Kotlin</p>
        </div>
      </div>
    </BentoCard>

    <!-- Research Card -->
    <BentoCard href="/research">
      <div class="flex flex-col justify-between h-full min-h-[180px]">
        <div>
          <p class="text-xs font-mono text-accent uppercase tracking-wider mb-2">Research</p>
          <div class="flex gap-2 flex-wrap">
            {papers.map(p => (
              <span class="text-xs font-mono bg-accent/10 text-accent px-2 py-1 rounded">
                {p.venue} '{String(p.year).slice(2)}
              </span>
            ))}
          </div>
          <p class="text-text-secondary text-sm mt-3">Multimodal ML · Video Understanding · NLP</p>
        </div>
        <span class="text-accent text-sm mt-4 group-hover:translate-x-1 transition-transform">Read papers &rarr;</span>
      </div>
    </BentoCard>

    <!-- Stats Card -->
    <BentoCard>
      <p class="text-xs font-mono text-accent uppercase tracking-wider mb-4">Stats</p>
      <div class="space-y-3">
        <div>
          <span class="font-display text-2xl font-bold">1805</span>
          <span class="text-text-secondary text-sm ml-2">Codeforces</span>
        </div>
        <div>
          <span class="font-display text-2xl font-bold">ICPC</span>
          <span class="text-text-secondary text-sm ml-2">Regional Finalist</span>
        </div>
        <div>
          <span class="font-display text-2xl font-bold">2000+</span>
          <span class="text-text-secondary text-sm ml-2">OneIITP users</span>
        </div>
      </div>
    </BentoCard>

    <!-- Connect Card (spans 2 cols) -->
    <BentoCard span="full" class="md:col-span-2">
      <p class="text-xs font-mono text-accent uppercase tracking-wider mb-4">Connect</p>
      <div class="flex flex-wrap gap-4">
        <a href="https://github.com/kirtan05" target="_blank" rel="noopener noreferrer"
           class="text-text hover:text-accent transition-colors font-medium">GitHub</a>
        <a href="https://linkedin.com/in/kirtan-jain" target="_blank" rel="noopener noreferrer"
           class="text-text hover:text-accent transition-colors font-medium">LinkedIn</a>
        <a href="mailto:kirtanjain0504@gmail.com"
           class="text-text hover:text-accent transition-colors font-medium">Email</a>
        <a href="/resume.pdf" download
           class="text-text hover:text-accent transition-colors font-medium">Resume &darr;</a>
      </div>
    </BentoCard>

  </div>
</section>
```

**Step 4: Update index.astro**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import BentoGrid from '../components/BentoGrid.astro';
---
<BaseLayout title="Kirtan Jain — Builder. Engineer. Researcher.">
  <BentoGrid />
</BaseLayout>
```

**Step 5: Verify homepage renders**

Run `npm run dev`. Check: bento grid displays with all 7 cards, correct typography, colors match design tokens, nav/footer present, grain overlay visible.

**Step 6: Commit**

```bash
git add src/components/BentoCard.astro src/components/BentoGrid.astro src/components/Hero.astro src/pages/index.astro
git commit -m "feat: build homepage bento grid hub with all cards"
```

---

## Task 6: GSAP Animations — Page Load + Card Tilt

**Files:**
- Create: `src/scripts/animations.ts`
- Modify: `src/layouts/BaseLayout.astro` (add script)

**Step 1: Create animation script**

Create `src/scripts/animations.ts`:

This file handles:
1. Staggered card entrance on page load
2. 3D cursor-tracking tilt on cards
3. Hero tagline word cycling (once on load, then on hover)

```ts
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

function initAnimations() {
  // Kill old instances (needed for View Transitions)
  ScrollTrigger.getAll().forEach(t => t.kill());

  // === Card stagger entrance ===
  const cards = document.querySelectorAll('[data-animate]');
  if (cards.length > 0) {
    gsap.fromTo(
      cards,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: 'power3.out',
      }
    );
  }

  // === 3D Card tilt ===
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach(card => {
    const maxTilt = 4; // degrees

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -maxTilt;
      const rotateY = ((x - centerX) / centerX) * maxTilt;

      gsap.to(card, {
        rotateX,
        rotateY,
        transformPerspective: 1000,
        duration: 0.3,
        ease: 'power2.out',
      });
    });

    card.addEventListener('mouseleave', () => {
      gsap.to(card, {
        rotateX: 0,
        rotateY: 0,
        duration: 0.5,
        ease: 'power2.out',
      });
    });
  });

  // === Hero tagline word cycling ===
  const taglineEl = document.querySelector('.tagline-word') as HTMLElement | null;
  if (taglineEl) {
    const words = JSON.parse(taglineEl.dataset.words || '[]') as string[];
    let currentIndex = 0;
    let hasPlayedIntro = false;

    function animateToWord(index: number) {
      gsap.to(taglineEl, {
        opacity: 0,
        y: -10,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => {
          if (taglineEl) {
            taglineEl.textContent = words[index];
            gsap.fromTo(
              taglineEl,
              { opacity: 0, y: 10 },
              { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
            );
          }
        },
      });
    }

    // Play intro sequence once
    async function playIntro() {
      if (hasPlayedIntro) return;
      hasPlayedIntro = true;
      for (let i = 1; i < words.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 800));
        currentIndex = i;
        animateToWord(i);
      }
    }

    playIntro();

    // On hover, cycle to next word
    const heroCard = taglineEl.closest('[data-tilt]');
    if (heroCard) {
      heroCard.addEventListener('mouseenter', () => {
        if (!hasPlayedIntro) return;
        currentIndex = (currentIndex + 1) % words.length;
        animateToWord(currentIndex);
      });
    }
  }

  // === ScrollTrigger for sub-page content ===
  document.querySelectorAll('[data-scroll-animate]').forEach(el => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none reverse',
        },
      }
    );
  });
}

// Run on initial load and after every View Transition
document.addEventListener('astro:page-load', initAnimations);
```

**Step 2: Import animation script in BaseLayout**

Add to `src/layouts/BaseLayout.astro`, just before `</body>`:

```astro
<script>
  import '../scripts/animations';
</script>
```

**Step 3: Verify animations**

Run `npm run dev`. Check:
- Cards stagger in on page load (fade up)
- Cards tilt slightly when you move cursor over them
- Hero tagline cycles through words on load, then on hover
- Grain overlay doesn't block interactions (pointer-events-none)

**Step 4: Commit**

```bash
git add src/scripts/animations.ts src/layouts/BaseLayout.astro
git commit -m "feat: add GSAP animations — card stagger, 3D tilt, tagline cycling"
```

---

## Task 7: Projects Page

**Files:**
- Create: `src/components/ProjectCard.astro`
- Create: `src/pages/projects.astro`

**Step 1: Create ProjectCard component**

Create `src/components/ProjectCard.astro`:

```astro
---
import type { Project } from '../data/projects';

interface Props {
  project: Project;
}

const { project } = Astro.props;
---
<article
  class="group rounded-2xl border border-border/50 bg-surface/80 p-6 backdrop-blur-xl
         hover:border-accent/20 hover:shadow-[0_0_30px_-5px_rgba(245,158,11,0.1)]
         transition-all duration-300"
  style="border-top: 0.5px solid rgba(255,255,255,0.05);"
  data-scroll-animate
  data-tilt
>
  <p class="text-xs font-mono text-accent uppercase tracking-wider mb-3">Project</p>
  <h2 class="font-display text-2xl font-semibold mb-2">{project.title}</h2>
  <p class="text-text-secondary text-sm leading-relaxed">
    {project.longDescription || project.description}
  </p>
  <div class="flex flex-wrap gap-2 mt-4">
    {project.tech.map(t => (
      <span class="text-xs font-mono bg-border/80 text-text-secondary px-2 py-1 rounded">
        {t}
      </span>
    ))}
  </div>
  {project.links.length > 0 && (
    <div class="flex gap-4 mt-4">
      {project.links.map(link => (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-accent hover:text-accent-hover transition-colors"
        >
          {link.label} &rarr;
        </a>
      ))}
    </div>
  )}
</article>
```

**Step 2: Create projects page**

Create `src/pages/projects.astro`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ProjectCard from '../components/ProjectCard.astro';
import { projects } from '../data/projects';
---
<BaseLayout title="Projects — Kirtan Jain" description="Things I've built.">
  <section class="mx-auto max-w-4xl px-6 py-12 md:py-20">
    <h1 class="font-display text-4xl md:text-5xl font-bold mb-4" data-scroll-animate>Projects</h1>
    <p class="text-text-secondary text-lg mb-12" data-scroll-animate>Things I've built and shipped.</p>

    <div class="space-y-6">
      {projects.map(project => (
        <ProjectCard project={project} />
      ))}
    </div>
  </section>
</BaseLayout>
```

**Step 3: Verify projects page**

Run `npm run dev`, navigate to `/projects`. Check: page transition animates, project cards display with correct data, scroll animations trigger, tilt works on cards.

**Step 4: Commit**

```bash
git add src/components/ProjectCard.astro src/pages/projects.astro
git commit -m "feat: add projects page with project cards and scroll animations"
```

---

## Task 8: Research Page

**Files:**
- Create: `src/components/PaperCard.astro`
- Create: `src/pages/research.astro`

**Step 1: Create PaperCard component**

Create `src/components/PaperCard.astro`:

```astro
---
import type { Paper } from '../data/papers';

interface Props {
  paper: Paper;
}

const { paper } = Astro.props;
---
<article
  class="group rounded-2xl border border-border/50 bg-surface/80 p-6 backdrop-blur-xl
         hover:border-accent/20 hover:shadow-[0_0_30px_-5px_rgba(245,158,11,0.1)]
         transition-all duration-300"
  style="border-top: 0.5px solid rgba(255,255,255,0.05);"
  data-scroll-animate
  data-tilt
>
  <div class="flex items-center gap-3 mb-3">
    <span class="text-xs font-mono bg-accent/10 text-accent px-2 py-1 rounded">
      {paper.venue} {paper.year}
    </span>
  </div>
  <h2 class="font-display text-xl font-semibold mb-2 leading-tight">{paper.title}</h2>
  <p class="text-text-secondary text-sm leading-relaxed">{paper.description}</p>
  {paper.links.length > 0 && (
    <div class="flex gap-4 mt-4">
      {paper.links.map(link => (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-accent hover:text-accent-hover transition-colors"
        >
          {link.label} &rarr;
        </a>
      ))}
    </div>
  )}
</article>
```

**Step 2: Create research page**

Create `src/pages/research.astro`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import PaperCard from '../components/PaperCard.astro';
import { papers } from '../data/papers';
---
<BaseLayout title="Research — Kirtan Jain" description="Published research in multimodal ML and NLP.">
  <section class="mx-auto max-w-4xl px-6 py-12 md:py-20">
    <h1 class="font-display text-4xl md:text-5xl font-bold mb-4" data-scroll-animate>Research</h1>
    <p class="text-text-secondary text-lg mb-12" data-scroll-animate>
      Published work in multimodal machine learning, video understanding, and NLP.
    </p>

    <div class="space-y-6">
      {papers.map(paper => (
        <PaperCard paper={paper} />
      ))}
    </div>
  </section>
</BaseLayout>
```

**Step 3: Verify research page**

Run `npm run dev`, navigate to `/research`. Check: papers display with venue badges, descriptions, arXiv links. Animations work.

**Step 4: Commit**

```bash
git add src/components/PaperCard.astro src/pages/research.astro
git commit -m "feat: add research page with publication cards"
```

---

## Task 9: About Page

**Files:**
- Create: `src/components/Timeline.astro`
- Create: `src/pages/about.astro`

**Step 1: Create Timeline component**

Create `src/components/Timeline.astro`:

```astro
---
import { experiences } from '../data/experience';
---
<div class="space-y-8">
  {experiences.map(exp => (
    <div class="relative pl-8 border-l border-border/50" data-scroll-animate>
      <div class="absolute left-0 top-1 w-2 h-2 rounded-full -translate-x-[5px]"
           class:list={[exp.current ? 'bg-accent' : 'bg-text-secondary']}></div>
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1">
        <h3 class="font-display text-lg font-semibold">{exp.company}</h3>
        <span class="text-xs font-mono text-text-secondary">{exp.period}</span>
      </div>
      <p class="text-text-secondary text-sm mb-2">{exp.role} · {exp.location}</p>
      <ul class="space-y-1">
        {exp.description.map(d => (
          <li class="text-text-secondary text-sm leading-relaxed">— {d}</li>
        ))}
      </ul>
    </div>
  ))}
</div>
```

**Step 2: Create about page**

Create `src/pages/about.astro`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Timeline from '../components/Timeline.astro';
import { achievements, education } from '../data/experience';
---
<BaseLayout title="About — Kirtan Jain" description="Engineer, researcher, builder.">
  <section class="mx-auto max-w-4xl px-6 py-12 md:py-20">
    <h1 class="font-display text-4xl md:text-5xl font-bold mb-8" data-scroll-animate>About</h1>

    <!-- Intro -->
    <div class="space-y-4 mb-16" data-scroll-animate>
      <p class="text-lg leading-relaxed">
        I'm Kirtan — an engineer at Samsung Research building Android framework components
        that ship on millions of devices. I care about building things that work at scale,
        whether that's a campus app serving 2000+ students or a room allocation system
        handling 3000 students in minutes.
      </p>
      <p class="text-text-secondary leading-relaxed">
        Outside of work, I publish research in multimodal ML, compete in programming contests,
        and quiz at the national level. I studied Computer Science at IIT Patna.
      </p>
    </div>

    <!-- Experience -->
    <div class="mb-16">
      <h2 class="font-display text-2xl font-semibold mb-6" data-scroll-animate>Experience</h2>
      <Timeline />
    </div>

    <!-- Education -->
    <div class="mb-16" data-scroll-animate>
      <h2 class="font-display text-2xl font-semibold mb-4">Education</h2>
      <div class="rounded-2xl border border-border/50 bg-surface/80 p-6 backdrop-blur-xl"
           style="border-top: 0.5px solid rgba(255,255,255,0.05);">
        <h3 class="font-display text-lg font-semibold">{education.institution}</h3>
        <p class="text-text-secondary text-sm">{education.degree}</p>
        <div class="flex gap-4 mt-2 text-xs font-mono text-text-secondary">
          <span>{education.period}</span>
          <span>CPI: {education.cpi}</span>
        </div>
      </div>
    </div>

    <!-- Achievements -->
    <div data-scroll-animate>
      <h2 class="font-display text-2xl font-semibold mb-4">Achievements</h2>
      <ul class="space-y-2">
        {achievements.map(a => (
          <li class="text-text-secondary text-sm leading-relaxed flex items-start gap-2">
            <span class="text-accent mt-1 shrink-0">—</span>
            <span>{a.text}</span>
          </li>
        ))}
      </ul>
    </div>
  </section>
</BaseLayout>
```

**Step 3: Verify about page**

Run `npm run dev`, navigate to `/about`. Check: intro text, experience timeline with dot indicators (amber for current), education card, achievements list. Scroll animations trigger.

**Step 4: Commit**

```bash
git add src/components/Timeline.astro src/pages/about.astro
git commit -m "feat: add about page with experience timeline and achievements"
```

---

## Task 10: Responsive Polish + SEO

**Files:**
- Modify: `src/components/Navbar.astro` (mobile menu)
- Modify: `src/layouts/BaseLayout.astro` (SEO meta)
- Create: `public/favicon.svg`

**Step 1: Add mobile-responsive navbar**

Update Navbar to include a hamburger menu for mobile. Use a simple CSS-only approach or minimal JS toggle.

**Step 2: Create favicon**

Create `public/favicon.svg` — a simple "KJ" monogram in amber:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0A0A0A"/>
  <text x="16" y="22" text-anchor="middle" font-family="system-ui" font-weight="700" font-size="14" fill="#F59E0B">KJ</text>
</svg>
```

**Step 3: Add robots.txt and sitemap**

Create `public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://kirtanjain.com/sitemap.xml
```

For sitemap, install the Astro sitemap integration:

```bash
npx astro add sitemap
```

Update `astro.config.mjs` to include `site: 'https://kirtanjain.com'` and the sitemap integration.

**Step 4: Test responsiveness**

Run `npm run dev`, test at mobile (375px), tablet (768px), and desktop (1280px) breakpoints. Verify: bento grid stacks to single column on mobile, navbar collapses, cards are readable, no horizontal scroll.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add responsive design, favicon, sitemap, SEO meta"
```

---

## Task 11: Copy Resume + Static Assets

**Files:**
- Copy: `resumes/resume.pdf` → `public/resume.pdf`

**Step 1: Copy the latest resume**

```bash
cp resumes/Resume_Jan26.pdf public/resume.pdf
```

**Step 2: Add a placeholder photo**

If no photo is available yet, ensure the photo card in BentoGrid gracefully shows a placeholder (already handled in Task 5).

**Step 3: Commit**

```bash
git add public/resume.pdf
git commit -m "feat: add downloadable resume"
```

---

## Task 12: Build Verification

**Step 1: Run production build**

```bash
npm run build
```

Expected: builds successfully with no errors.

**Step 2: Preview production build**

```bash
npm run preview
```

Navigate through all pages (/, /projects, /research, /about). Verify:
- All page transitions work
- Animations play correctly
- Fonts load (no FOUT/FOIT issues)
- Links work (resume download, social links, navigation)
- No console errors

**Step 3: Commit any fixes**

If any fixes were needed:

```bash
git add -A
git commit -m "fix: production build fixes"
```

---

## Task 13: Push to GitHub + Vercel Deploy

**Step 1: Initialize git remote**

```bash
git remote add origin https://github.com/kirtan05/kirtansite.git
git branch -M main
git push -u origin main
```

**Step 2: Connect to Vercel**

Either via Vercel dashboard (import project from GitHub) or CLI:

```bash
npm i -g vercel
vercel login
vercel link
vercel --prod
```

In Vercel dashboard:
- Framework Preset: Astro
- Build Command: `astro build` (auto-detected)
- Output Directory: `dist` (auto-detected)

**Step 3: Configure custom domain**

In Vercel dashboard → Settings → Domains → Add `kirtanjain.com`.
Follow DNS instructions (either Vercel nameservers or A/CNAME records).

**Step 4: Verify live deployment**

Visit the Vercel preview URL first, then kirtanjain.com once DNS propagates. Check all pages, animations, and links.

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Project scaffold | astro.config.mjs, package.json |
| 2 | Fonts & design tokens | global.css, public/fonts/ |
| 3 | Base layout + grain overlay | BaseLayout.astro, Navbar, Footer, GrainOverlay |
| 4 | Data layer | projects.ts, papers.ts, experience.ts |
| 5 | Homepage bento grid | BentoGrid, BentoCard, Hero, index.astro |
| 6 | GSAP animations | animations.ts (stagger, tilt, tagline) |
| 7 | Projects page | ProjectCard.astro, projects.astro |
| 8 | Research page | PaperCard.astro, research.astro |
| 9 | About page | Timeline.astro, about.astro |
| 10 | Responsive + SEO | Mobile nav, favicon, sitemap |
| 11 | Static assets | Resume PDF |
| 12 | Build verification | Production build + preview |
| 13 | Deploy | GitHub push + Vercel + custom domain |
