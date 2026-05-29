import { CodeCopyButton } from "./code-copy-button";

type Props = {
  code: string;
  lang?: string;
  title?: string;
};

/** Lightweight code block (no Shiki) — keeps docs dev stable on modest machines. */
export function CodeBlock({ code, lang = "text", title }: Props) {
  const raw = code.trim();

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{title ?? lang}</span>
        <CodeCopyButton raw={raw} />
      </div>
      <pre className="code-block-body">
        <code>{raw}</code>
      </pre>
    </div>
  );
}
