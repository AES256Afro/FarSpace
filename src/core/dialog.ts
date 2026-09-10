// Text prompts and confirms that never throw: some embeds (sandboxed iframes,
// headless previews) have no window.prompt, and a frame must not die over it.

export function ask(message: string, def = ""): string | null {
  try { return window.prompt(message, def); } catch { return null; }
}

export function confirmBox(message: string): boolean {
  try { return window.confirm(message); } catch { return false; }
}
