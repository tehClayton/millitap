/* Interaction shared between pages. Data lives in store.js; this is the other
   half — behaviour that more than one page needs and that must not fork into
   two subtly different copies. */
"use strict";

/* The value, floated clear of the finger covering it.

   Whether to show it is decided from the POINTER THAT IS ACTUALLY DRAGGING,
   not from what kind of device this is. Device detection cannot answer the
   question reliably and does not need to: a touchscreen laptop reports touch
   capability while you use its trackpad, an iPad with a mouse attached reports
   the opposite, and user-agent sniffing is wrong on anything released after it
   was written. `pointerType` is per-interaction and exact — touch and pen hide
   the number behind something, a mouse never does — so that is the test.

   One element for the whole page, created on first use and moved around,
   because two scrub fields can never be dragged at once. */
let scrubPop = null;
function popShow(el, text){
  if (!scrubPop){
    scrubPop = document.createElement("div");
    scrubPop.id = "scrubPop";
    scrubPop.setAttribute("aria-hidden", "true");   // the field itself announces
    document.body.appendChild(scrubPop);
  }
  scrubPop.textContent = text;
  const r = el.getBoundingClientRect();
  scrubPop.style.left = Math.round(r.left + r.width/2) + "px";
  // Clamped, so a field near the top of the viewport does not push it off.
  scrubPop.style.top  = Math.max(30, Math.round(r.top - 8)) + "px";
  scrubPop.classList.add("on");
}
function popHide(){ if (scrubPop) scrubPop.classList.remove("on"); }

/* Vertical scrubbing on a numeric field: press and drag, up to raise, down to
   lower, the gesture every DAW uses on a value. f supplies get/set, the bounds,
   the size of one notch (step), how far you drag for one (px), an optional
   commit fired once on release, and an optional fmt for how the floating
   readout should word the value. */
function scrubEl(el, f){
  const apply = v => f.set(Math.max(f.min, Math.min(f.max, v)));
  const say = () => (f.fmt ? f.fmt(f.get()) : String(f.get()));
  let base = 0, y0 = 0, live = false, pop = false;

  el.addEventListener("pointerdown", e => {
    live = true; base = f.get(); y0 = e.clientY;
    pop = e.pointerType === "touch" || e.pointerType === "pen";
    el.setPointerCapture(e.pointerId);
    el.classList.add("drag");
    if (pop) popShow(el, say());
    e.preventDefault();
  });

  el.addEventListener("pointermove", e => {
    if (!live) return;
    // Screen y grows downward, so subtracting puts "up" on the positive side.
    apply(base + Math.round((y0 - e.clientY) / f.px) * f.step);
    if (pop) popShow(el, say());
  });

  const end = e => {
    if (!live) return;
    live = false;
    el.classList.remove("drag");
    if (pop){ popHide(); pop = false; }
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
