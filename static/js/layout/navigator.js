// The notes navigator: the panel holding the tree. On a wide window it is docked beside the
// note; on a narrow one (the right third of a wide screen) it is a drawer over the note that
// opens on demand. It knows nothing about notes: it only shows, hides and hands the focus on.
//
//   const nav = new Navigator({ panel, button, backdrop, onShow, onHide });
//   nav.show()                    open the drawer (if narrow), then onShow() (focus the tree)
//   nav.hide()                    close the drawer (if open), then onHide() (focus the editor)
//   nav.hide({ refocus: false })  close it and leave the focus alone
//
// While the drawer is closed the panel is inert, so Tab never lands in a tree nobody sees.

// Keep in step with the @media (max-width: ...) rules in static/css/base.css and navigator.css.
export const NARROW_QUERY = "(max-width: 1399.98px)";

export class Navigator {
  constructor({ panel, button, backdrop, onShow = () => {}, onHide = () => {}, media = window.matchMedia(NARROW_QUERY) }) {
    this.panel = panel;
    this.button = button;
    this.backdrop = backdrop;
    this.onShow = onShow;
    this.onHide = onHide;
    this.media = media;
    this.opened = false;
    button.addEventListener("click", () => this.toggle());
    backdrop.addEventListener("click", () => this.hide());
    // Tab (or a click) taking the focus out of the open drawer closes it behind itself.
    panel.addEventListener("focusout", (event) => {
      const to = event.relatedTarget;
      if (to && !panel.contains(to) && to !== button) this.hide({ refocus: false });
    });
    media.addEventListener("change", () => {
      // Going narrow makes a docked tree a closed drawer: the focus can't stay in it.
      const hadFocus = panel.contains(document.activeElement);
      this.opened = false;
      this.apply();
      if (hadFocus && this.isDrawer) this.onHide();
    });
    this.apply();
  }

  get isDrawer() {
    return this.media.matches;
  }

  get isOpen() {
    return this.isDrawer && this.opened;
  }

  show() {
    this.opened = true;
    this.apply();
    this.onShow();
  }

  hide({ refocus = true } = {}) {
    this.opened = false;
    this.apply();
    if (refocus) this.onHide();
  }

  toggle() {
    if (this.isOpen) this.hide();
    else this.show();
  }

  apply() {
    const drawer = this.isDrawer;
    const open = this.isOpen;
    this.panel.inert = drawer && !open;
    this.panel.dataset.open = String(open);
    this.backdrop.hidden = !open;
    if (drawer) this.button.setAttribute("aria-expanded", String(open));
    else this.button.removeAttribute("aria-expanded");
  }
}
