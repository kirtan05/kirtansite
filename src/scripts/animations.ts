import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Store cleanup functions for non-ScrollTrigger listeners
let cleanupFns: (() => void)[] = [];

function initAnimations(): void {
  // Kill old ScrollTrigger instances
  ScrollTrigger.getAll().forEach((t) => t.kill());

  // Clean up old event listeners from previous page
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];

  // 1. Card stagger entrance — dramatic scale + rotation
  const animateEls = document.querySelectorAll('[data-animate]');
  if (animateEls.length > 0) {
    gsap.fromTo(
      animateEls,
      { opacity: 0, y: 60, scale: 0.96, rotateX: 8 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        rotateX: 0,
        duration: 1,
        stagger: 0.1,
        ease: 'power4.out',
        delay: 0.15,
        transformPerspective: 1200,
      },
    );
  }

  // 2. Hero name — character-by-character stagger with spring
  const heroChars = document.querySelectorAll('.hero-char');
  if (heroChars.length > 0) {
    gsap.fromTo(
      heroChars,
      { opacity: 0, y: 50, rotateX: -90 },
      {
        opacity: 1,
        y: 0,
        rotateX: 0,
        duration: 0.8,
        stagger: 0.04,
        ease: 'back.out(1.7)',
        delay: 0.3,
        transformPerspective: 1000,
      },
    );
  }

  // 3. Hero tagline — fade in after name
  const heroTagline = document.querySelector('.hero-tagline');
  if (heroTagline) {
    gsap.fromTo(
      heroTagline,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.9 },
    );
  }

  // 4. 3D card tilt + cursor glow tracking
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
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

      // Update glow position via CSS custom properties
      el.style.setProperty('--glow-x', `${x}px`);
      el.style.setProperty('--glow-y', `${y}px`);
      el.classList.add('is-hovering');
    };

    const handleMouseLeave = () => {
      gsap.to(el, {
        rotateX: 0,
        rotateY: 0,
        duration: 0.6,
        ease: 'power2.out',
      });

      el.classList.remove('is-hovering');
    };

    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);

    cleanupFns.push(() => {
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
    });
  });

  // 5. Hero tagline word cycling — continuous loop
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

      // Start continuous cycling after hero animation finishes
      let interval: ReturnType<typeof setInterval>;
      const timeout = setTimeout(() => {
        interval = setInterval(cycleWord, 2500);
      }, 1500);

      cleanupFns.push(() => {
        clearTimeout(timeout);
        clearInterval(interval);
      });

      // Also cycle on hero card hover
      const heroCard = taglineEl.closest('[data-tilt]');
      if (heroCard) {
        const handleHeroEnter = () => cycleWord();
        heroCard.addEventListener('mouseenter', handleHeroEnter);
        cleanupFns.push(() => heroCard.removeEventListener('mouseenter', handleHeroEnter));
      }
    }
  }

  // 6. Counter rollup animation
  document.querySelectorAll<HTMLElement>('[data-counter]').forEach((el) => {
    const target = parseInt(el.dataset.counter!, 10);
    const suffix = el.dataset.counterSuffix || '';
    const obj = { val: 0 };

    gsap.to(obj, {
      val: target,
      duration: 2,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        once: true,
      },
      onUpdate: () => {
        el.textContent = Math.round(obj.val) + suffix;
      },
    });
  });

  // 7. ScrollTrigger reveals for [data-scroll-animate] elements
  document.querySelectorAll('[data-scroll-animate]').forEach((el) => {
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

// Run on initial load and after client-side navigation
document.addEventListener('astro:page-load', initAnimations);
