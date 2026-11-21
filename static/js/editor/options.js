// Editor options and :set. Defaults follow Vim, except where notes want otherwise:
// autoindent on (lists keep their indent), expandtab with shiftwidth 2 (Tab is not an
// editor key, so indenting is >> and <<).
import { EditorError } from "./errors.js";

export const OPTIONS = [
  { name: "ignorecase", short: "ic", type: "bool", value: false },
  { name: "smartcase", short: "scs", type: "bool", value: false },
  { name: "hlsearch", short: "hls", type: "bool", value: true },
  { name: "incsearch", short: "is", type: "bool", value: true },
  { name: "wrapscan", short: "ws", type: "bool", value: true },
  { name: "wrap", short: "wrap", type: "bool", value: true },
  { name: "autoindent", short: "ai", type: "bool", value: true },
  { name: "expandtab", short: "et", type: "bool", value: true },
  { name: "shiftwidth", short: "sw", type: "number", value: 2, min: 1 },
  { name: "scrolloff", short: "so", type: "number", value: 3, min: 0 },
];

export function defaultOptions() {
  return Object.fromEntries(OPTIONS.map((option) => [option.name, option.value]));
}

function findOption(name) {
  return OPTIONS.find((option) => option.name === name || option.short === name) ?? null;
}

function describe(vim, option) {
  const value = vim.options[option.name];
  if (option.type === "number") return `${option.name}=${value}`;
  return value ? `  ${option.name}` : `no${option.name}`;
}

/** :set arg — "ic", "noic", "invic", "ic!", "ic?", "sw=4", "sw&", or nothing to list them. */
export function setOptions(vim, arg) {
  const words = arg.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    vim.say(OPTIONS.map((option) => describe(vim, option).trim()).join("  "));
    return;
  }
  const shown = [];
  for (const word of words) {
    const match = /^(no|inv)?([a-z]+)(\?|!|&|[=:](.*))?$/.exec(word);
    const option = match && findOption(match[2]);
    if (!option) throw new EditorError(`E518: Unknown option: ${word}`);
    const [, prefix, , suffix, value] = match;
    if (suffix === "?" || (!suffix && !prefix && option.type === "number")) {
      shown.push(describe(vim, option));
    } else if (suffix === "&") {
      vim.options[option.name] = option.value;
    } else if (option.type === "number") {
      const number = Number(value);
      if (value === undefined || !Number.isInteger(number) || number < option.min) {
        throw new EditorError(`E521: Number required after =: ${word}`);
      }
      vim.options[option.name] = number;
    } else if (value !== undefined) {
      throw new EditorError(`E474: Invalid argument: ${word}`);
    } else {
      const invert = prefix === "inv" || suffix === "!";
      vim.options[option.name] = invert ? !vim.options[option.name] : prefix !== "no";
    }
  }
  if (shown.length) vim.say(shown.join("  "));
}
