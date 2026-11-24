import * as React from "react";

/** Kleine, veilige Markdown-weergave (geen HTML-injectie): koppen, lijsten, code, vet/cursief, links. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[Bron \d+\]|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("`")) nodes.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("[Bron")) nodes.push(<span key={key} className="mx-0.5 rounded bg-turq-400/15 px-1 text-[0.8em] font-semibold text-turq-600 dark:text-turq-300">{tok.slice(1, -1)}</span>);
    else if (tok.startsWith("[")) {
      const lm = tok.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      nodes.push(lm ? <a key={key} href={lm[2]} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-sky-strong underline dark:text-brand-sky">{lm[1]}</a> : tok);
    } else nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={k++}>{code.join("\n")}</pre>);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const Tag = (`h${h[1].length + 1}`) as "h2" | "h3" | "h4";
      blocks.push(<Tag key={k++}>{inline(h[2], `h${k}`)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+\.)\s+/, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={k++}>{items.map((it, j) => <li key={j}>{inline(it, `l${k}-${j}`)}</li>)}</List>);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("```") && !/^(#{1,3})\s/.test(lines[i]) && !/^\s*([-*•]|\d+\.)\s+/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={k++}>
        {para.map((p, j) => (
          <React.Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `p${k}-${j}`)}
          </React.Fragment>
        ))}
      </p>,
    );
  }
  return <div className="prose-chat text-[14.5px] leading-relaxed">{blocks}</div>;
}
