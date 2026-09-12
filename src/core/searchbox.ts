// An in-page text field also works in hosts that do not expose window.prompt.
export function openSearchBox(title: string, value: string, done: (query: string | null) => void): () => void {
  const dialog = document.createElement("dialog"), form = document.createElement("form");
  dialog.style.cssText = "color:#d9e2ef;background:#101827;border:1px solid #89e1c1;padding:24px;max-width:420px;width:calc(100% - 72px);font:16px monospace";
  const label = document.createElement("label"), input = document.createElement("input");
  label.textContent = `Find in ${title.toLowerCase()}`;
  input.type = "search"; input.value = value; input.maxLength = 48; input.autocomplete = "off";
  input.style.cssText = "display:block;box-sizing:border-box;width:100%;margin:16px 0;padding:10px;font:inherit;color:#fff;background:#080d17;border:1px solid #89e1c1";
  label.append(input);
  const hint = document.createElement("p"); hint.textContent = "Leave empty to show every section."; hint.style.fontSize = "13px";
  const find = document.createElement("button"), cancel = document.createElement("button");
  find.type = "submit"; find.textContent = "Find"; cancel.type = "button"; cancel.textContent = "Cancel";
  for (const button of [find, cancel]) button.style.cssText = "font:inherit;padding:8px 18px;margin:8px 12px 0 0;cursor:pointer";
  let closed = false;
  const finish = (query: string | null) => {
    if (closed) return; closed = true; dialog.remove(); done(query);
  };
  form.onsubmit = e => { e.preventDefault(); finish(input.value); };
  cancel.onclick = () => finish(null);
  dialog.oncancel = e => { e.preventDefault(); finish(null); };
  dialog.onkeydown = e => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); finish(null); }
  };
  dialog.onkeyup = e => e.stopPropagation();
  form.append(label, hint, find, cancel); dialog.append(form); document.body.append(dialog);
  dialog.showModal(); input.focus(); input.select();
  return () => finish(null);
}
