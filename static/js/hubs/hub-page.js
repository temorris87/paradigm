// The hub page: when the open note is a hub (or a person, or a meeting), the hub line above
// the note and the section panel under it; for any other note, neither. It knows the tree,
// the people, the meetings and the tab table, and tells the page which note to open; it
// never opens notes itself.
//
//   const hub = new HubPage({ page: mainElement, line, section, onOpen(id), onLeave() });
//   hub.show({ tree, people, meetings }, currentId)    after every redraw of the notes page
//   hub.focus()                  :hub (opens a collapsed panel first)
//   hub.hub                      the open hub (person, meeting) note, or null
//   hub.editorHidden             the panel is expanded over the note
//
// page carries data-hub-size (collapsed | open | expanded) while a hub is open, for the CSS.
import { Meetings } from "../meetings/meetings-model.js";
import { isHub, isMeeting, isPerson } from "../notes/hub-groups.js";
import { People } from "../people/people-model.js";
import { showHubLine } from "./hub-line.js";
import { HubPanel } from "./hub-panel.js";
import { loadSize, loadTabs, saveSize, saveTabs, stepSize } from "./hub-size.js";
import { tabsFor } from "./hub-tabs.js";

export class HubPage {
  constructor({ page, line, section, onOpen, onLeave }) {
    this.page = page;
    this.line = line;
    this.section = section;
    this.onOpen = onOpen;
    this.onLeave = onLeave;
    this.tree = null;
    this.people = new People();
    this.meetings = new Meetings();
    this.hub = null;
    this.size = loadSize();
    this.tabKeys = loadTabs();
    this.tabs = [];
    this.tabIndex = 0;
    this.rows = [];
    this.active = 0;
    this.panel = new HubPanel(section, {
      onAction: (action, event) => this.perform(action, event),
      onTab: (index) => this.selectTab(index),
      onRow: (index) => this.openRow(index),
      onSize: (size) => this.setSize(size),
    });
    this.apply();
  }

  context() {
    return { tree: this.tree, people: this.people, meetings: this.meetings };
  }

  get editorHidden() {
    return Boolean(this.hub) && this.size === "expanded";
  }

  show({ tree, people = new People(), meetings = new Meetings() }, currentId) {
    this.tree = tree;
    this.people = people;
    this.meetings = meetings;
    const shown = [isHub, isPerson, isMeeting].some((is) => is(tree, currentId));
    const hub = shown ? tree.get(currentId) : null;
    const sameHub = hub && hub.id === this.hub?.id;
    const activeId = sameHub ? this.rows[this.active]?.id : undefined;
    this.hub = hub;
    if (!hub) {
      this.apply();
      return;
    }
    this.tabs = tabsFor(hub);
    const remembered = this.tabs.findIndex((tab) => tab.key === this.tabKeys[hub.id]);
    if (!sameHub) this.tabIndex = Math.max(0, remembered);
    this.tabIndex = Math.min(this.tabIndex, this.tabs.length - 1);
    this.rows = this.tabs[this.tabIndex].rows(this.context(), hub);
    // Redrawn with the same hub open (a note renamed, another tab's change): keep the row.
    this.active = Math.max(0, this.rows.findIndex((row) => row.id === activeId));
    this.apply();
  }

  apply() {
    const hub = this.hub;
    this.section.hidden = !hub;
    showHubLine(this.line, this.context(), hub, (id) => this.onOpen(id));
    if (!hub) {
      delete this.page.dataset.hubSize;
      return;
    }
    this.page.dataset.hubSize = this.size;
    const tab = this.tabs[this.tabIndex];
    this.panel.draw({
      tabs: this.tabs,
      tabIndex: this.tabIndex,
      rows: this.rows,
      empty: tab.empty(hub),
      active: this.active,
      size: this.size,
    });
  }

  focus() {
    if (!this.hub) return;
    if (this.size === "collapsed") this.setSize("open");
    this.panel.focus();
  }

  perform(action, event) {
    const last = this.rows.length - 1;
    switch (action) {
      case "next": return this.moveTo(Math.min(this.active + 1, last));
      case "previous": return this.moveTo(Math.max(this.active - 1, 0));
      case "first": return this.moveTo(0);
      case "last": return this.moveTo(last);
      case "open": return this.openRow(this.active);
      case "previousTab": return this.selectTab(this.tabIndex - 1);
      case "nextTab": return this.selectTab(this.tabIndex + 1);
      case "tabNumber": return this.selectTab(Number(event.key) - 1);
      case "smaller": return this.setSize(stepSize(this.size, -1));
      case "larger": return this.setSize(stepSize(this.size, 1));
      case "editor":
        // The editor is hidden under an expanded panel: show it before going back to it.
        if (this.size === "expanded") this.setSize("open");
        return this.onLeave();
    }
  }

  moveTo(index) {
    if (index < 0) return;
    this.active = index;
    this.panel.markActive(index);
  }

  openRow(index) {
    const row = this.rows[index];
    if (row) this.onOpen(row.id);
  }

  selectTab(index) {
    if (!this.hub || index < 0 || index >= this.tabs.length || index === this.tabIndex) return;
    this.tabIndex = index;
    this.tabKeys[this.hub.id] = this.tabs[index].key;
    saveTabs(this.tabKeys);
    this.rows = this.tabs[index].rows(this.context(), this.hub);
    this.active = 0;
    this.apply();
  }

  setSize(size) {
    if (size === this.size) return;
    const hidesEditor = size === "expanded" && !this.panel.hasFocus();
    this.size = size;
    saveSize(size);
    this.apply();
    // A click on ⤢ while typing in the note: the focus can't stay in a hidden editor.
    if (hidesEditor) this.panel.focus();
  }
}
