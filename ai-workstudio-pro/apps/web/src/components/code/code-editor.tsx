"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";

function languageFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["js", "mjs", "cjs", "jsx"].includes(ext)) return javascript({ jsx: true });
  if (["ts", "tsx", "mts", "cts"].includes(ext)) return javascript({ jsx: ext === "tsx", typescript: true });
  if (ext === "json") return json();
  if (["md", "mdx"].includes(ext)) return markdown();
  if (["css", "scss"].includes(ext)) return css();
  if (["html", "htm", "vue", "svelte"].includes(ext)) return html();
  if (ext === "py") return python();
  return null;
}

/** CodeMirror 6-editor met syntaxkleuring op basis van de bestandsextensie. */
export function CodeEditor({ path, value, onChange, onSave, readOnly }: { path: string; value: string; onChange: (v: string) => void; onSave?: () => void; readOnly?: boolean }) {
  const extensions = useMemo(() => {
    const lang = languageFor(path);
    return lang ? [lang] : [];
  }, [path]);
  return (
    <div
      className="h-full min-h-0 overflow-hidden text-[13px]"
      data-testid="code-editor"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          onSave?.();
        }
      }}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={oneDark}
        height="100%"
        style={{ height: "100%" }}
        extensions={extensions}
        readOnly={readOnly}
        basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, bracketMatching: true, autocompletion: true, tabSize: 2 }}
        aria-label={`Editor voor ${path}`}
      />
    </div>
  );
}
