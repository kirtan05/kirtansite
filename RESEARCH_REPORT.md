# Personal Portfolio Website Research Report
## Compiled March 2, 2026

---

## Table of Contents
1. [Best Developer/Portfolio Websites 2025-2026](#1-best-developerportfolio-websites-2025-2026)
2. [Minimalist Web Design Trends 2025-2026](#2-minimalist-web-design-trends-2025-2026)
3. [Cool Web Animations & Micro-Interactions](#3-cool-web-animations--micro-interactions)
4. [Personal Branding for Multifaceted People](#4-personal-branding-for-multifaceted-people)
5. [Tech Stack for Modern Portfolio Sites](#5-tech-stack-for-modern-portfolio-sites)
6. [Anti-Patterns to Avoid](#6-anti-patterns-to-avoid--the-ai-slop-problem)

---

## 1. Best Developer/Portfolio Websites 2025-2026

### Standout Examples & What Makes Them Work

**Brittany Chiang** (brittanychiang.com)
- Dark-schemed, single-page layout. Senior frontend engineer at Klaviyo.
- Signature move: cursor-following glow effect, navigation items that highlight as content scrolls into view.
- Showcases attention-to-detail with subtle hover effects, a work history carousel, and project load transitions.
- Has been cloned/forked hundreds of times on GitHub -- a sign of how influential the design became.
- Key takeaway: The site feels *handcrafted*. Every interaction is intentional, not decorative.

**Bruno Simon** (bruno-simon.com)
- A full 3D interactive game where visitors drive a small car through a world to explore projects.
- Built with Three.js (WebGL) and Cannon.js (physics engine).
- Interactive areas expand when driving over them but also support mouse hover.
- Won Awwwards Site of the Day. Code is MIT-licensed on GitHub.
- Key takeaway: This is the extreme end of "show, don't tell." His portfolio IS his portfolio piece.

**Lee Robinson** (leerob.io)
- Ultra-minimal. Built with Next.js + Tailwind + Vercel (he's VP of Product at Vercel).
- Evolved from static HTML -> Jekyll -> Hugo -> Next.js/React/MDX over the years.
- Features a personal dashboard with metrics (sales, views, subscribers).
- Static pre-rendered blog with MDX. Source code is public.
- Key takeaway: Radical simplicity. The writing IS the portfolio. No flashy animations needed when your content speaks for itself.

**Other Notable 2025-2026 Portfolios:**

| Site | What Stands Out |
|------|----------------|
| Jordan Cruz-Correa | Windows 98 theme with working Notepad and recycle bin -- nostalgia as personality |
| Jesse Zhou | 3D ramen hut navigation with a vending machine of projects |
| Ryan Furrer | Strong color scheme, generous whitespace, clear UI hierarchy |
| Sharon Yi | Playful colors and emojis showcase personality through creative web development |
| Niall McDermott | Split-screen design (static left, scrollable right) built on Webflow free plan |
| Clement Grellier | French frontend dev; pixel-perfect micro-interactions, minimal aesthetics, tight design-code integration |

**Awwwards Recognition (Late 2025 - Early 2026):**
- Artiom Yakushev -- Site of the Month, January 2026 (Developer Award)
- Elliott Mangham -- Site of the Day, December 27, 2025
- Olha Lazarieva -- Developer Award, Site of the Day, October 2, 2025

### Key Pattern: The Spectrum of Approaches
Developer portfolios in 2025-2026 exist on a spectrum:
1. **Hyper-minimal** (leerob.io) -- Content-first, near-zero decoration, blog-driven
2. **Refined interactive** (brittanychiang.com) -- Subtle animations, dark theme, polished single-page
3. **Immersive experience** (bruno-simon.com) -- The site IS the project, full WebGL/3D

The best sites pick a lane and commit fully. The worst try to do a little of everything.

---

## 2. Minimalist Web Design Trends 2025-2026

### The Big Shifts

**"Barely-There UI"**
- Interfaces becoming almost invisible: one font family, palettes reduced to 2-3 tones.
- White space is structural, not decorative. It defines hierarchy.
- This is NOT the same as "boring." It means every element earns its place.

**Softening from Rigid Minimalism**
- After years of strict grids and sharp edges, design is softening.
- Organic shapes, flowing lines, and soft gradients replacing harsh geometric constraints.
- Think: natural, approachable, human -- not sterile.

**Asymmetry as Intentional Imbalance**
- Moving past perfect alignment into compositions that feel more natural and dynamic.
- Asymmetry creates movement through intentional imbalance.
- Minimalist compositions feel dynamic without losing coherence.

**The Archival Index Aesthetic**
- A major 2026 trend: mixing images with tiny labels, understated typography, catalog-style information.
- Think of it as the "museum index card" approach to web design.
- Minimal but information-rich. Structured but not rigid.

### Typography Trends

**What's Rising:**
- Chunky, juicy serifs for headings -- not the thin, delicate ones of 2020-2023
- Italic fonts in liquid, bubbled, or vintage styles
- Variable fonts for responsive weight/width control from a single file
- Typography as storytelling: custom fonts, oversized headlines, motion-enabled type

**Specific Fonts Gaining Traction (Alternatives to Inter/Roboto):**

| Font | Character | Best For |
|------|-----------|----------|
| **Space Grotesk** | Geometric, futuristic, clean lines | Tech-forward developer sites |
| **Clash Display** | Bold serif, high contrast, elegant curves | Hero sections, headlines |
| **Satoshi** | Geometric sans-serif, soft, contemporary | Versatile body + headings |
| **Geist** (Vercel) | Similar to Inter but rounder, friendlier | Body text, UI elements |
| **Host Grotesk** | Expressive but controlled, tight curves | Small text, refined feel |
| **General Sans** | Neutral yet expressive | SaaS-inspired portfolios |
| **Cabinet Grotesk** | Clean variable sans-serif, precise | Headlines + body |
| **Supreme** | Constructed aesthetic, visual engagement | Display headings |

**Font Pairing Strategy:**
Pair a distinctive display font (headings) with a refined body font. Example combos:
- Clash Display + Satoshi
- Space Grotesk (headings) + General Sans (body)
- A bold serif + a clean geometric sans-serif

### Color Trends

**Dark Mode Dominance:**
- 82.7% of consumers use dark mode on their devices.
- Deep charcoal (#1A1A1A to #2D2D2D) preferred over pure black (#000000) -- pure black feels flat and harsh.
- Adaptive color systems that adjust to viewing context.

**Palette Approaches:**

| Approach | Description | Vibe |
|----------|-------------|------|
| **Dark + Neon Accent** | Charcoal base, single bright accent (cyan, green, amber) | Technical, focused |
| **Earth Tones** | Olive green, terracotta, clay, moss on dark base | Grounded, natural, warm |
| **Warm Dark** | Deep oranges, reds, browns as accents on dark | Cozy, welcoming |
| **Monochrome + One Color** | Grayscale with a single saturated accent | Dramatic, intentional |
| **Muted Pastels on Dark** | Soft tones on charcoal | Sophisticated, calm |

**The Rule:** Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Pick ONE hero color and commit.

---

## 3. Cool Web Animations & Micro-Interactions

### Animation Libraries: The 2025-2026 Landscape

**GSAP (GreenSock Animation Platform)**
- The undisputed king of JavaScript animation libraries.
- Timeline-based, incredibly precise control.
- Built-in plugins: SplitText (character animation), ScrollTrigger, MorphSVG, DrawSVG.
- Now **completely free for all users** including commercial projects (since Webflow's acquisition in 2024).
- Best for: Complex sequences, scroll-driven animations, artistic/cinematic effects.

**Motion (formerly Framer Motion)**
- The React ecosystem's go-to animation library.
- Declarative, component-based API.
- 2.5x faster than GSAP at animating from unknown values; 6x faster at animating between different value types.
- Best for: UI-focused animations, enter/exit transitions, hover effects, layout shifts, page transitions.

**When to Use Which:**
- **GSAP** when you need precise timeline control, scroll-driven sequences, or framework-agnostic animation.
- **Motion** when you're in React and need state-based UI animations, gesture handling, or layout animations.
- Both can coexist in a project.

### Scroll-Triggered Animations (GSAP ScrollTrigger)

**Key Techniques:**
- **Parallax:** `scrub: 1` ties element position/rotation to scrollbar position
- **Text Reveals:** SplitText plugin animates individual characters as they enter viewport
- **Scroll-Triggered Highlights:** Text highlights animate left-to-right when entering viewport
- **Pinning:** Pin elements while ScrollTrigger is active (horizontal scroll sections, slide-in panels)
- **3D Scroll-Driven Text:** CSS transforms combined with ScrollTrigger for depth effects

### Micro-Interactions That Matter

**Cursor Effects:**
- Morphing cursors that expand, shrink, or change shape over interactive elements.
- Cursor-following elements (lights, images, text reveals).
- Magnetic buttons that subtly pull toward the cursor on hover.

**Hover States:**
- Fluid typography shifts (weight, size, spacing) on hover.
- Color bleeding/spreading effects.
- Image reveal on text hover (hover a project name, see a preview).

**Scroll Interactions:**
- Content revealed progressively as you scroll.
- Apple-style scroll-driven animations (images/text slide in at precise moments).
- Parallax layers creating depth during scroll.

**Performance Guidelines:**
- Keep micro-interactions between 300-400ms with smooth easing curves.
- One well-orchestrated page load sequence with staggered reveals creates more impact than scattered micro-animations.
- Never let animation delay the user's journey.

### The View Transitions API (Critical for Astro)

- Browser-native page transition animations for multi-page apps.
- 85%+ browser support in 2025 (Chrome 126+, Firefox 144+).
- In Astro: just 2 lines of code (`<ViewTransitions />` in layout head).
- Built-in animations: fade, slide, none.
- Automatic fallback: unsupported browsers get normal navigation, no breakage.
- Makes multi-page Astro sites feel like SPAs without the JavaScript overhead.

---

## 4. Personal Branding for Multifaceted People

### The Core Challenge
How do you represent someone who is a developer + quizzer + entrepreneur (or any combination of identities) without the site feeling scattered or unfocused?

### Strategy 1: The Unified Headline
Lead with a single, memorable identity statement that encompasses all roles.
- NOT: "Developer | Quizzer | Entrepreneur" (the pipe-separated list is overused and feels like a LinkedIn headline)
- BETTER: A single sentence that weaves roles into a narrative. Example: "I build things for the web, compete in quiz bowls, and run businesses."
- BEST: A tagline that captures the *essence* rather than listing roles. Example: "Endlessly curious. Perpetually building."

### Strategy 2: Sections, Not Silos
- Introduce all roles on the homepage without overcrowding.
- Dedicate distinct sections (or pages) for each pursuit.
- Use consistent visual branding across all sections so it feels cohesive.
- The homepage acts as a "digital home base" -- a launchpad to deeper content.

### Strategy 3: Keep Brands Distinct but Congruent
- Personal brand website and any company/project brand websites should be "clearly artistically related with the same feel" but serve different purposes.
- Personal site = credibility, connection, authority.
- Project sites = specific audience, specific purpose.

### Strategy 4: Show the Connective Thread
- The most interesting multi-hyphenate sites show WHY these roles belong to the same person.
- What's the common thread? Curiosity? Problem-solving? Competition?
- Surfacing that thread makes the multiple identities feel intentional, not scattered.

### Design Approaches for Multi-Identity Sites

**Bento Grid Layout:**
- Perfect for multi-identity people.
- Different-sized cards for different aspects of your life/work.
- Largest card = most important/current identity. Smaller cards = secondary interests.
- 67% of top ProductHunt SaaS products now use bento grids.
- Uniform gap spacing (12-24px) between cards is critical for polish.

**Tabbed or Filtered Homepage:**
- Let visitors choose which "you" they want to explore.
- Tabs/filters for: Code, Quiz, Business, Writing, etc.
- Each filter reshapes the content without a page reload.

**Timeline/Journey Approach:**
- Chronological story that shows how different identities emerged.
- Makes the multi-hyphenate identity feel like a natural evolution, not a random collection.

---

## 5. Tech Stack for Modern Portfolio Sites

### Framework Comparison for Personal Sites

**Astro (Recommended for Most Portfolio Sites)**
- Content-first framework, ships zero JavaScript by default.
- "Islands architecture" -- only interactive components load JS.
- ~40% faster loads and ~90% less JS than comparable Next.js setup.
- Build time: ~13 seconds vs ~73 seconds for Next.js (82% faster builds).
- File-based routing, Markdown/MDX support out of the box.
- View Transitions API built-in (2 lines of code for smooth page transitions).
- Can use React, Vue, Svelte, or vanilla JS components within Astro.
- Ideal for: Blogs, documentation, portfolios, content-heavy sites.

**Next.js (When You Need More)**
- Full-stack React framework. API routes, server-side rendering, React Server Components.
- Best when you need: dynamic features (dashboards, authentication, databases), complex interactivity, API endpoints.
- Lee Robinson's site uses it because he literally works at Vercel.
- Overkill for a static portfolio, but great if you want a blog + dashboard + API.

**SvelteKit (The Dark Horse)**
- Excellent DX, built-in animations, minimal boilerplate.
- Smaller ecosystem than React but growing.
- Great for portfolios that need moderate interactivity.

**Plain HTML/CSS/JS (The Underrated Choice)**
- Zero build step, zero dependencies, zero framework churn.
- For a truly minimal site with a few pages, this is perfectly valid.
- Pair with a static site generator like 11ty for templating.

### Recommended Stack for a Portfolio

```
Framework:     Astro (content-first, zero JS by default)
Styling:       Tailwind CSS 4 (utility-first, but with custom design tokens)
Animations:    GSAP (ScrollTrigger, SplitText) + CSS transitions
Content:       Markdown/MDX files (blog posts, project descriptions)
Transitions:   Astro View Transitions API (built-in)
Fonts:         Self-hosted via @fontsource or Google Fonts
Deployment:    Cloudflare Pages (free, unlimited bandwidth, 300+ CDN locations)
               OR Vercel (better build caching, native Astro support)
```

### Deployment Comparison

| Feature | Cloudflare Pages | Vercel | Netlify |
|---------|-----------------|--------|---------|
| Free bandwidth | Unlimited | 100GB/month | 100GB/month |
| CDN locations | 300+ | ~20 regions | Limited |
| Build caching | Manual enable | Automatic | Automatic |
| Cold start | None (Pages) | Possible (serverless) | Possible |
| Custom domains | Free | Free | Free |
| Best for | Static/SSR hybrid | Next.js projects | General JAMstack |

**Recommendation:** Cloudflare Pages for a static Astro portfolio (unlimited free bandwidth, global CDN, zero cold starts). Vercel if you need server-side features or are using Next.js.

### Deployment Best Practices (Astro + Cloudflare Pages)
- Connect GitHub repo for automatic deploy on push to main.
- Enable Build Caching in Settings (reduces publish time from 10-15s to 1-2s).
- Use `export const prerender = true` for OG images, sitemaps, and other static content.
- Avoid file system operations in SSR (Workers are stateless).

---

## 6. Anti-Patterns to Avoid -- The "AI Slop" Problem

### What is AI Slop?
A documented phenomenon where AI-generated designs are instantly recognizable because LLMs are statistical pattern matchers, not designers. When you prompt "build a landing page" without constraints, you get the statistical median of every Tailwind tutorial scraped from GitHub between 2019-2024.

### The Telltale Signs of AI-Generated Design

**The Purple Gradient Problem:**
- Tailwind CSS's `bg-indigo-500` became the default for an entire generation of tutorials.
- Every AI model absorbed this pattern. Now every AI-generated site has purple/indigo gradients.
- This isn't a bad color -- it's just the *average* color. It signals "no thought was put into this."

**The Generic Font Stack:**
- Inter, Roboto, Arial, system fonts.
- Inter is a fine font. It's also the font that screams "I didn't choose a font."
- The fix: Pick ONE distinctive font and use it decisively.

**The Three-Box Layout:**
- Three equal columns with icons, headings, and descriptions.
- It's the most common pattern in Tailwind tutorials.
- Every AI generates it by default.

**Other Red Flags:**
- Rounded corners on everything (the default `rounded-lg` epidemic)
- Generic hero with gradient text saying "Build something amazing"
- Cookie-cutter card layouts with no personality
- Stock-photo-feeling illustrations
- Vague, surface-level copy that could apply to anyone

### How to NOT Look AI-Generated

**1. Define Design Tokens Before Writing Code**
- Pick your colors, fonts, and spacing scale FIRST.
- Document them. Make them specific to you.
- Don't let defaults become your design.

**2. Use Your Own Design System**
- Work inside your repo with existing components and tokens.
- Blank sandboxes lead to slop.
- The more context AI has about YOUR system, the better its output.

**3. The Four Dimensions of Distinction:**

| Dimension | AI Default | What to Do Instead |
|-----------|-----------|-------------------|
| **Typography** | Inter/Roboto at default weights | Pick a distinctive font (Space Grotesk, Clash Display, Satoshi). Use it at unexpected sizes/weights. |
| **Color** | Purple gradients, blue-to-indigo | Commit to a specific palette. Warm earth tones, monochrome + one accent, dark + amber. One dominant color, sharp accent. |
| **Motion** | No animation or generic fade-in | One orchestrated page load with staggered reveals (animation-delay) beats scattered micro-interactions. |
| **Backgrounds** | Solid white or solid dark | Layer textures: gradient meshes, noise/grain overlays, geometric patterns, subtle shadows. |

**4. Add Noise/Grain Texture**
- A subtle SVG noise overlay (opacity: 0.1) over dark backgrounds instantly adds organic warmth.
- Combats the "sterile digital" feel of flat colors.
- Prevents gradient banding on long gradients.
- Tools: fffuel.co/nnnoise, CSS-Tricks grainy gradients technique.

**5. Spatial Composition**
- Use unexpected layouts, asymmetry, and overlap.
- Break away from the predictable 12-column grid.
- Let elements breathe at different rates.

**6. Write Like a Human**
- The biggest giveaway of AI slop is generic copy.
- "Passionate developer building amazing experiences" = AI slop.
- "I once spent 3 days debugging a CSS issue that turned out to be a single missing semicolon" = human.
- Specificity is authenticity. Be concrete, be weird, be you.

**7. Show Real Work, Not Placeholders**
- Real screenshots > mockup generators.
- Actual code snippets > generic terminal images.
- Your actual face > no photo at all > AI-generated avatar.

### The Authenticity Checklist

Before launching, ask yourself:
- [ ] Could this site belong to literally anyone? (If yes, you have a problem.)
- [ ] Is every design choice intentional, or did I accept defaults?
- [ ] Does the typography have character, or is it "safe"?
- [ ] Is my color palette mine, or could it be a Tailwind demo?
- [ ] Does my copy contain specific details about MY life and work?
- [ ] Would someone remember this site after seeing 50 portfolios?
- [ ] Does the site reflect how I actually think and work?

---

## Summary: Actionable Takeaways

### DO:
1. **Pick a lane** -- hyper-minimal, refined interactive, or immersive experience. Commit fully.
2. **Choose distinctive typography** -- Space Grotesk, Clash Display, Satoshi, or similar. NOT Inter.
3. **Use dark mode with intention** -- charcoal base (#1A1A1A-#2D2D2D), one dominant accent color.
4. **Add grain/noise texture** -- subtle SVG noise at 0.1 opacity over backgrounds.
5. **Use Astro** for the framework -- zero JS by default, View Transitions built-in, MDX for blog.
6. **Deploy to Cloudflare Pages** -- free, fast, unlimited bandwidth.
7. **Orchestrate one great page-load animation** -- staggered reveals > scattered micro-interactions.
8. **Use GSAP ScrollTrigger** for scroll-driven animations -- it's now free.
9. **Write specific, concrete, human copy** -- your actual stories, your actual quirks.
10. **Use a bento grid** for showcasing multiple identities/projects -- asymmetric, scale-based hierarchy.

### DON'T:
1. Purple/indigo gradients (the universal AI default).
2. Inter/Roboto at default settings.
3. Three-box icon layouts.
4. Generic hero text ("Build something amazing").
5. Pipe-separated identity lists ("Developer | Designer | Creator").
6. Over-animating everything. Restraint is taste.
7. Using Notion/template-based builders (they all look the same).
8. Accepting Tailwind defaults as your design system.
9. Stock illustrations or AI-generated avatars.
10. Copying another developer's site layout 1:1 (looking at you, Brittany Chiang forks).

---

## Sources

### Portfolio Examples & Inspiration
- [Awwwards Portfolio Winners](https://www.awwwards.com/websites/winner_category_portfolio/)
- [Muzli Top 100 Portfolio Websites 2025](https://muz.li/blog/top-100-most-creative-and-unique-portfolio-websites-of-2025/)
- [Colorlib Developer Portfolios 2026](https://colorlib.com/wp/developer-portfolios/)
- [WeAreDevelopers Portfolio Inspiration March 2025](https://www.wearedevelopers.com/en/magazine/561/web-developer-portfolio-inspiration-and-examples-march-2025-561)
- [Elementor Best Portfolio Examples](https://elementor.com/blog/best-web-developer-portfolio-examples/)
- [Brittany Chiang - One Page Love](https://onepagelove.com/brittany-chiang)
- [Bruno Simon Portfolio Case Study](https://medium.com/@bruno_simon/bruno-simon-portfolio-case-study-960402cc259b)
- [Lee Robinson's Site (GitHub)](https://github.com/leerob/site)
- [Emma Bostian Developer Portfolios List](https://github.com/emmabostian/developer-portfolios)

### Design Trends
- [Digital Silk - Minimalist Web Design Trends 2026](https://www.digitalsilk.com/digital-trends/minimalist-web-design-trends/)
- [Figma - Web Design Trends 2026](https://www.figma.com/resource-library/web-design-trends/)
- [Squarespace Circle - Design Trends 2026](https://pros.squarespace.com/blog/design-trends)
- [Graphic Design Junction - Web Design Trends 2026](https://graphicdesignjunction.com/2025/12/web-design-trends-of-2026/)
- [Elementor - Web Design Trends 2026](https://elementor.com/blog/web-design-trends-2026/)

### Typography
- [Digidop - 20 Best Fonts for Modern Websites 2026](https://www.digidop.com/blog/the-20-best-fonts-for-modern-and-impactful-website-in-2025)
- [Shakuro - Best Fonts for Web Design 2025](https://shakuro.com/blog/best-fonts-for-web-design)
- [Creative Bloq - Typography Trends 2026](https://www.creativebloq.com/design/fonts-typography/breaking-rules-and-bringing-joy-top-typography-trends-for-2026)
- [DesignMonks - Typography Trends 2026](https://www.designmonks.co/blog/typography-trends-2026)

### Animations & Interactions
- [Semaphore - Framer Motion vs GSAP](https://semaphore.io/blog/react-framer-motion-gsap)
- [Motion.dev (formerly Framer Motion)](https://motion.dev)
- [GSAP ScrollTrigger Documentation](https://gsap.com/scroll/)
- [Codrops - 3D Scroll-Driven Text Animations](https://tympanus.net/codrops/2025/11/04/creating-3d-scroll-driven-text-animations-with-css-and-gsap/)
- [Webflow - Microinteraction Examples](https://webflow.com/blog/microinteractions)
- [Color Colour Creative - Micro-Interactions 2025](https://www.colorcolourcreative.com/creative-hub/2025/micro-interactions)

### Color & Visual Design
- [WebPortfolios.dev - Best Color Palettes for Developer Portfolios](https://www.webportfolios.dev/blog/best-color-palettes-for-developer-portfolio)
- [Vev - Dark Mode Color Palettes](https://www.vev.design/blog/dark-mode-website-color-palette/)
- [CSS-Tricks - Grainy Gradients](https://css-tricks.com/grainy-gradients/)
- [fffuel SVG Noise Generator](https://www.fffuel.co/nnnoise/)

### Tech Stack & Deployment
- [Astro View Transitions Docs](https://docs.astro.build/en/guides/view-transitions/)
- [Pagepro - Astro vs Next.js 2025](https://pagepro.co/blog/astro-nextjs/)
- [Dev.to - Migrating Portfolio from Next.js to Astro](https://dev.to/alexcloudstar/i-moved-my-portfolio-website-from-nextjs-to-astro-best-decision-ever-4454)
- [Cloudflare Pages Astro Deployment Guide](https://docs.astro.build/en/guides/deploy/cloudflare/)
- [Vercel vs Netlify vs Cloudflare 2025 Comparison](https://www.digitalapplied.com/blog/vercel-vs-netlify-vs-cloudflare-pages-comparison)

### Anti-Patterns & AI Slop
- [Why Your AI Keeps Building the Same Purple Gradient Website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)
- [AI Purple Problem: Make Your UI Unmistakable](https://dev.to/jaainil/ai-purple-problem-make-your-ui-unmistakable-3ono)
- [TechBytes - Escape AI Slop Frontend Design Guide](https://techbytes.app/posts/escape-ai-slop-frontend-design-guide/)
- [Anthropic Skills - Frontend Design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
- [Claude Blog - Improving Frontend Design Through Skills](https://claude.com/blog/improving-frontend-design-through-skills)

### Bento Grid & Layout
- [BentoGrids.com](https://bentogrids.com)
- [SaaSFrame - Designing Bento Grids 2026 Guide](https://www.saasframe.io/blog/designing-bento-grids-that-actually-work-a-2026-practical-guide)
- [Senorit - Bento Grid Design Trend 2025](https://senorit.de/en/blog/bento-grid-design-trend-2025)

### Personal Branding
- [Elementor - Best Personal Website Examples](https://elementor.com/blog/best-personal-website-examples/)
- [Copyfol.io - Personal Brand Websites 2026](https://blog.copyfol.io/personal-brand-website)
- [FreshySites - Best Personal Brand Websites 2025](https://freshysites.com/web-design-development/best-personal-brand-websites/)
