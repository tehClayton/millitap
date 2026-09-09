/* Interaction shared between pages. Data lives in store.js; this is the other
   half — behaviour that more than one page needs and that must not fork into
   two subtly different copies. */
"use strict";

/* Vertical scrubbing on a numeric field: press and drag, up to raise, down to
   lower, the gesture every DAW uses on a value. f supplies get/set, the bounds,
   the size of one notch (step), how far you drag for one (px), and an optional
   commit fired once on release. */
function scrubEl(el, f){
  const apply = v => f.set(Math.max(f.min, Math.min(f.max, v)));
  let base = 0, y0 = 0, live = false;

  el.addEventListener("pointerdown", e => {
    live = true; base = f.get(); y0 = e.clientY;
    el.setPointerCapture(e.pointerId);
    el.classList.add("drag");
    e.preventDefault();
  });

  el.addEventListener("pointermove", e => {
    if (!live) return;
    // Screen y grows downward, so subtracting puts "up" on the positive side.
    apply(base + Math.round((y0 - e.clientY) / f.px) * f.step);
  });

  const end = e => {
    if (!live) return;
    live = false;
    el.classList.remove("drag");
    if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId))
      el.releasePointerCapture(e.pointerId);
    if (f.commit) f.commit();
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);

  /* A drag is not reachable from a keyboard, and these fields replaced sliders
     that were. role=spinbutton means the value is what gets announced. */
  el.addEventListener("keydown", e => {
    const up = e.key === "ArrowUp"   || e.key === "PageUp";
    const dn = e.key === "ArrowDown" || e.key === "PageDown";
    if (!up && !dn) return;
    e.preventDefault();
    const mult = (e.key === "PageUp" || e.key === "PageDown") ? 10 : 1;
    apply(f.get() + (up ? 1 : -1) * f.step * mult);
    if (f.commit) f.commit();
  });
}

/* 380 -> "6:20". Durations here are always minutes and seconds. */
function mmss(sec){
  const s = Math.max(0, Math.round(sec));
  return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0");
}
