import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

function initAnimations(): void {
  // Kill old ScrollTrigger instances to prevent duplicates after View Transitions
  ScrollTrigger.getAll().forEach((t) => t.kill());

  // 1. Card stagger entrance
  const animateEls = document.querySelectorAll('[data-animate]');
  if (animateEls.length > 0) {
    gsap.fromTo(
      animateEls,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        stagger: 0.08,
        ease: 'power3.out',
        delay: 0.1,
      },
    );

    // Also animate the inner content divs
    const innerDivs = document.querySelectorAll('[data-animate] > div');
    gsap.fromTo(
      innerDivs,
      { opacity: 0, y: 24 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        stagger: 0.08,
        ease: 'power3.out',
        delay: 0.2,
      },
    );
  }

  // 2. 3D card tilt on mousemove
  const tiltEls = document.querySelectorAll<HTMLElement>('[data-tilt]');
  tiltEls.forEach((el) => {
    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -4;
      const rotateY = ((x - centerX) / centerX) * 4;

      gsap.to(el, {
        rotateX,
        rotateY,
        transformPerspective: 1000,
        duration: 0.4,
        ease: 'power2.out',
      });
    };

    const handleMouseLeave = () => {
      gsap.to(el, {
        rotateX: 0,
        rotateY: 0,
        duration: 0.6,
        ease: 'power2.out',
      });
    };

    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);
  });

  // 3. Hero tagline word cycling
  const taglineEl = document.querySelector<HTMLElement>('.tagline-word');
  if (taglineEl) {
    const wordsAttr = taglineEl.getAttribute('data-words');
    if (wordsAttr) {
      const words: string[] = JSON.parse(wordsAttr);
      let currentIndex = 0;

      const cycleWord = () => {
        currentIndex = (currentIndex + 1) % words.length;
        gsap.to(taglineEl, {
          opacity: 0,
          y: -10,
          duration: 0.3,
          ease: 'power2.in',
          onComplete: () => {
            taglineEl.textContent = words[currentIndex];
            gsap.fromTo(
              taglineEl,
              { opacity: 0, y: 10 },
              { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' },
            );
          },
        });
      };

      // Animate through words once on page load
      let loadCycleCount = 0;
      const loadInterval = setInterval(() => {
        cycleWord();
        loadCycleCount++;
        if (loadCycleCount >= words.length - 1) {
          clearInterval(loadInterval);
        }
      }, 800);

      // Cycle on hero card hover (mouseenter on parent BentoCard)
      const heroCard = taglineEl.closest('[data-tilt]');
      if (heroCard) {
        heroCard.addEventListener('mouseenter', () => {
          cycleWord();
        });
      }
    }
  }

  // 4. ScrollTrigger reveals for [data-scroll-animate] elements
  const scrollEls = document.querySelectorAll('[data-scroll-animate]');
  scrollEls.forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          once: true,
        },
      },
    );
  });
}

// Run on initial load and after View Transitions
document.addEventListener('astro:page-load', initAnimations);
