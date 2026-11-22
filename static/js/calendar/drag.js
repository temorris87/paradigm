// Following one pointer drag: from the pointerdown to the pointerup. A press that never moves
// further than a few pixels is a click, not a drag. Pointer events, not HTML drag and drop:
// they work the same for the mouse, a pen and a touch screen, and the drop shows exactly
// where the block goes.
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
  const up = (event) => finish(event, (at) => (dragging ? onDrop(at) : onClick(at)));
  const cancel = (event) => finish(event, () => onCancel());
  const escape = (event) => {
    if (event.key !== "Escape" || !dragging) return;
    event.preventDefault();
    event.stopPropagation();
    finish({ pointerId: down.pointerId }, () => onCancel());
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", escape, true);
}
