export const REVEAL_EFFECTS = ['none', 'fade', 'rise', 'left', 'right', 'zoom', 'blur'] as const;
export type RevealEffect = typeof REVEAL_EFFECTS[number];
export const REVEAL_LABELS: Record<RevealEffect, string> = {
  none: 'Off', fade: 'Fade in', rise: 'Rise up', left: 'Slide from left', right: 'Slide from right', zoom: 'Zoom in', blur: 'Blur in',
};

/** Animates individual CSS properties so an item's position and rotation stay intact. */
export function revealScript(effect: RevealEffect = 'none', duration = 750, repeat = false) {
  return `<script>
(() => {
  if (!window.IntersectionObserver || !Element.prototype.animate) return;
  const defaults = ${JSON.stringify({ effect, duration, repeat })}, root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), items = [...document.querySelectorAll('.stack [data-block-id]:not(.space)')];
  const frames = {
    fade: [{ opacity: 0 }, { opacity: 1 }],
    rise: [{ opacity: 0, translate: '0 28px' }, { opacity: 1, translate: '0 0' }],
    left: [{ opacity: 0, translate: '-28px 0' }, { opacity: 1, translate: '0 0' }],
    right: [{ opacity: 0, translate: '28px 0' }, { opacity: 1, translate: '0 0' }],
    zoom: [{ opacity: 0, scale: '.92' }, { opacity: 1, scale: '1' }],
    blur: [{ opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0)' }],
  };
  let observer, editing, animations = new Map();
  // Anchored items must be measured in their saved position, rather than halfway through an entrance.
  window.yourlinkiMeasure = (measure) => {
    const active = (document.getAnimations ? document.getAnimations() : [...animations.values()])
      .filter((a) => a.effect && a.effect.target && a.effect.target.closest('.stack') && a.playState !== 'finished' && a.playState !== 'idle');
    const saved = active.map((animation) => ({ animation, time: animation.currentTime, state: animation.playState, fill: animation.effect.getTiming().fill }));
    try {
      saved.forEach(({ animation }) => { animation.pause(); animation.effect.updateTiming({ fill: 'none' }); animation.currentTime = -1; });
      return measure();
    } finally {
      saved.forEach(({ animation, time, state }) => {
        animation.currentTime = time;
        animation.effect.updateTiming({ fill: saved.find((item) => item.animation === animation).fill });
        if (state === 'running') animation.play();
      });
    }
  };
  function reset() {
    if (observer) observer.disconnect();
    animations.forEach((animation) => animation.cancel()); animations.clear();
    items.forEach((el) => el.classList.remove('reveal-pending', 'scroll-reveal'));
    editing = root.classList.contains('canvas-editing');
    if (editing || reduced.matches) return;
    try {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const el = entry.target;
          if (!entry.isIntersecting) {
            if (defaults.repeat) { const old = animations.get(el); if (old) old.cancel(); el.classList.add('reveal-pending'); }
            return;
          }
          if (!el.classList.contains('reveal-pending')) return;
          el.classList.remove('reveal-pending');
          const effect = el.dataset.reveal || defaults.effect;
          const opacity = Number(getComputedStyle(el).opacity);
          const keyframes = (frames[effect] || frames.fade).map((frame) => ({ ...frame, opacity: frame.opacity * opacity }));
          const animation = el.animate(keyframes, {
            duration: defaults.duration, delay: Number(el.dataset.revealDelay) || 0,
            easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards',
          });
          animations.set(el, animation);
          animation.onfinish = () => { animations.delete(el); };
          if (!defaults.repeat) observer.unobserve(el);
        });
      }, { threshold: 0 });
      items.forEach((el) => {
        const effect = el.dataset.reveal || defaults.effect;
        if (!frames[effect]) return;
        el.classList.add('scroll-reveal');
        // Items already scrolled past stay visible, including browser-restored scroll positions.
        if (!defaults.repeat && el.getBoundingClientRect().bottom < 0) return;
        observer.observe(el); el.classList.add('reveal-pending');
      });
    } catch { items.forEach((el) => el.classList.remove('reveal-pending')); }
  }
  reset();
  reduced.addEventListener && reduced.addEventListener('change', reset);
  new MutationObserver(() => { if (editing !== root.classList.contains('canvas-editing')) reset(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
})();
</script>`;
}
