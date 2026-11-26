// Following one pointer drag: from the pointerdown to the pointerup. A press that never moves
// further than a few pixels is a click, not a drag. Pointer events, not HTML drag and drop:
// they work the same for the mouse, a pen and a touch screen, and the drop shows exactly
// where the block goes.
//
// A drag ends with a release over a different element from the press (the ghost lets the
// pointer through), so the browser's click lands on their common ancestor: the grid's body,
// which reads it as a click on an empty slot and opens New meeting. After a real drag the one
// click that follows is swallowed.
//
//   trackDrag(pointerdownEvent, { onStart(), onMove(event), onDrop(event), onClick(event), onCancel() })
const THRESHOLD_PX = 4;

export function trackDrag(down, { onStart = () => {}, onMove = () => {}, onDrop = () => {}, onClick = () => {}, onCancel = () => {} }) {
  let dragging = false;
  const move = (event) => {
    if (event.pointerId !== down.pointerId) return;
    if (!dragging && Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) < THRESHOLD_PX) return;
    if (!dragging) {
      dragging = true;
      document.body.classList.add("is-dragging");
      onStart();
    }
    event.preventDefault();
    onMove(event);
  };
  const finish = (event, run) => {
    if (event.pointerId !== down.pointerId) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", escape, true);
    document.body.classList.remove("is-dragging");
    run(event);
  };
  const up = (event) => finish(event, (at) => {
    if (!dragging) return onClick(at);
    swallowNextClick();
    onDrop(at);
  });
  const cancel = (event) => finish(event, () => onCancel());
  const escape = (event) => {
    if (event.key !== "Escape" || !dragging) return;
    event.preventDefault();
    event.stopPropagation();
    finish({ pointerId: down.pointerId }, () => onCancel());
    // The button is still down: its release would click an empty slot too.
    swallowClickAfterRelease(down.pointerId);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", escape, true);
}

/** Drops the next click anywhere, in the capture phase so no handler sees it. The browser fires
 *  that click in the same task as the pointerup, so a listener left over on the next tick would
 *  only eat a later, real click: it goes away then whether or not a click came. */
function swallowNextClick() {
  const swallow = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    stop();
  };
  const stop = () => window.removeEventListener("click", swallow, true);
  window.addEventListener("click", swallow, true);
  setTimeout(stop, 0);
}

function swallowClickAfterRelease(pointerId) {
  const release = (event) => {
    if (event.pointerId !== pointerId) return;
    window.removeEventListener("pointerup", release, true);
    window.removeEventListener("pointercancel", release, true);
    if (event.type === "pointerup") swallowNextClick();
  };
  window.addEventListener("pointerup", release, true);
  window.addEventListener("pointercancel", release, true);
}
