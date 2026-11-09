// Tiny promise-based tween scheduler driven by the render loop.
const active = new Set();
export const clock = { speed: 1, now: 0 };
export const ease = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};
// duration in seconds (scaled by clock.speed unless `real`)
export function tween(duration, fn, easing = ease.inOut, real = false) {
  return new Promise((resolve) => {
    if (duration <= 0) { fn(1); resolve(); return; }
    active.add({ t: 0, duration, fn, easing, resolve, real });
  });
}
export const wait = (seconds, real = false) => tween(seconds, () => {}, ease.linear, real);
export function updateTweens(dt) {
  clock.now += dt;
  for (const a of active) {
    a.t += (a.real ? dt : dt * clock.speed) / a.duration;
    const t = Math.min(1, a.t);
    a.fn(a.easing(t), t);
    if (t >= 1) { active.delete(a); a.resolve(); }
  }
}
