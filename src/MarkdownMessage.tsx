import { Clipboard, Check } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

type MarkdownMessageProps = {
  content: string;
};

type Block =
  | { type: "code"; language: string; content: string }
  | { type: "heading"; level: number; content: string }
  | { type: "blockquote"; content: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "paragraph"; content: string };

const languageKeywords: Record<string, string[]> = {
  js: ["const", "let", "var", "function", "return", "import", "from", "export", "async", "await"],
  jsx: ["const", "let", "function", "return", "import", "from", "export", "className"],
  ts: ["const", "let", "type", "interface", "function", "return", "import", "from", "export", "async", "await"],
  tsx: ["const", "let", "type", "interface", "function", "return", "import", "from", "export", "className"],
  rust: ["fn", "let", "mut", "pub", "struct", "enum", "impl", "use", "mod", "async", "await", "match", "Result"],
  rs: ["fn", "let", "mut", "pub", "struct", "enum", "impl", "use", "mod", "async", "await", "match", "Result"],
  py: ["def", "class", "import", "from", "return", "async", "await", "if", "else", "elif", "for", "while"],
  python: ["def", "class", "import", "from", "return", "async", "await", "if", "else", "elif", "for", "while"],
  json: ["true", "false", "null"],
  toml: ["true", "false"],
  yaml: ["true", "false", "null"],
  yml: ["true", "false", "null"]
};

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className="markdown-message">
      {blocks.map((block, index) => (
        <MarkdownBlock block={block} key={`${block.type}-${index}`} />
      ))}
    </div>
  );
}

function MarkdownBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "code":
      return <CodeBlock block={block} />;

    case "heading": {
      const HeadingTag = `h${Math.min(Math.max(block.level, 1), 4)}` as "h1" | "h2" | "h3" | "h4";
      return <HeadingTag>{renderInline(block.content)}</HeadingTag>;
    }

    case "blockquote":
      return <blockquote>{renderInline(block.content)}</blockquote>;

    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag>
          {block.items.map((item, index) => (
            <li key={`${item}-${index}`}>{renderInline(item)}</li>
          ))}
        </ListTag>
      );
    }

    case "table":
      return (
        <div className="markdown-table-wrap">
          <table>
            <thead>
              <tr>
                {block.headers.map((header, index) => (
                  <th key={`${header}-${index}`}>{renderInline(header)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {block.headers.map((_header, cellIndex) => (
                    <td key={`cell-${rowIndex}-${cellIndex}`}>
                      {renderInline(row[cellIndex] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "paragraph":
      return <p>{renderInline(block.content)}</p>;
  }
}

function CodeBlock({ block }: { block: Extract<Block, { type: "code" }> }) {
  const [copied, setCopied] = useState(false);
  const language = block.language || "text";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(block.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <figure className="code-block">
      <figcaption>
        <span>{language}</span>
        <button type="button" onClick={handleCopy} aria-label="Copy code">
          {copied ? <Check size={15} aria-hidden="true" /> : <Clipboard size={15} aria-hidden="true" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </figcaption>
      <pre>
        <code>{highlightCode(block.content, language)}</code>
      </pre>
    </figure>
  );
}

function parseMarkdown(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const codeMatch = line.match(/^```([\w-]*)\s*$/);
    if (codeMatch) {
      const language = codeMatch[1] || "text";
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: "code", language, content: codeLines.join("\n") });
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2]
      });
      index += 1;
      continue;
    }

    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", content: quoteLines.join(" ") });
      continue;
    }

    if (isListItem(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length && isListItem(lines[index])) {
        items.push(lines[index].replace(/^\s*(?:[-*]|\d+\.)\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = splitTableRow(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith("```") &&
      !lines[index].match(/^(#{1,4})\s+(.+)$/) &&
      !lines[index].trim().startsWith(">") &&
      !isListItem(lines[index]) &&
      !isTableStart(lines, index)
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "paragraph", content: paragraphLines.join("\n") });
  }

  return blocks;
}

function isListItem(line: string) {
  return /^\s*(?:[-*]|\d+\.)\s+/.test(line);
}

function isTableStart(lines: string[], index: number) {
  if (index + 1 >= lines.length) {
    return false;
  }

  return lines[index].includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]);
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInline(content: string) {
  const parts: ReactNode[] = [];
  const pattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("`")) {
      parts.push(<code key={`inline-${match.index}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      parts.push(<strong key={`strong-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a key={`link-${match.index}`} href={linkMatch[2]} rel="noreferrer" target="_blank">
            {linkMatch[1]}
          </a>
        );
      }
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length ? parts : content;
}

function highlightCode(content: string, language: string) {
  const keywords = languageKeywords[language.toLowerCase()] ?? [];
  if (!keywords.length) {
    return content;
  }

  const pattern = new RegExp(`\\b(${keywords.map(escapeRegExp).join("|")})\\b`, "g");
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }
    nodes.push(
      <span className="code-keyword" key={`${match[0]}-${match.index}`}>
        {match[0]}
      </span>
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
