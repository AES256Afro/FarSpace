// Wrap complete text, including long names or codes without spaces.
export function wrapText(text: string, width: number): string[] {
  if (!Number.isInteger(width) || width < 1) throw new Error("Invalid text width");
  return text.split("\n").flatMap(paragraph => {
    const lines: string[] = [];
    let line = "";
    for (const source of paragraph.trim().split(/\s+/)) {
      let word = source;
      if (line && line.length + word.length + 1 > width) { lines.push(line); line = ""; }
      while (word.length > width) { lines.push(word.slice(0, width)); word = word.slice(width); }
      line = line ? `${line} ${word}` : word;
    }
    if (line || !lines.length) lines.push(line);
    return lines;
  });
}
