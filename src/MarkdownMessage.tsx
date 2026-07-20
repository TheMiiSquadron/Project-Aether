import "highlight.js/styles/github-dark.css";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { Check, Clipboard } from "lucide-react";
import { memo, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  content: string;
};

const languageLabels: Record<string, string> = {
  bash: "bash",
  css: "css",
  diff: "diff",
  dockerfile: "dockerfile",
  html: "html",
  js: "javascript",
  javascript: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  markdown: "markdown",
  ps1: "powershell",
  py: "python",
  python: "python",
  rs: "rust",
  rust: "rust",
  sh: "bash",
  sql: "sql",
  toml: "toml",
  ts: "typescript",
  tsx: "typescript",
  txt: "text",
  yaml: "yaml",
  yml: "yaml"
};

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

const markdownComponents: Components = {
  a({ children, href, node: _node, ...props }) {
    return (
      <a href={href} rel="noreferrer" target="_blank" {...props}>
        {children}
      </a>
    );
  },
  code({ children, className, node: _node, ...props }) {
    const language = getLanguageFromClassName(className);
    const text = toText(children);
    const isBlock = language || text.endsWith("\n");
    const rawCode = text.replace(/\n$/, "");

    if (isBlock) {
      return <CodeBlock code={rawCode} language={language} />;
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  img({ alt, src, node: _node, ...props }) {
    return (
      <span className="markdown-image-wrap">
        <img alt={alt ?? ""} loading="lazy" src={src ?? ""} {...props} />
      </span>
    );
  },
  li({ children, className, node: _node, ...props }) {
    if (className?.includes("task-list-item")) {
      return (
        <li className={className} {...props}>
          <label className="task-list-label">{children}</label>
        </li>
      );
    }

    return (
      <li className={className} {...props}>
        {children}
      </li>
    );
  },
  table({ children, node: _node, ...props }) {
    return (
      <div className="markdown-table-wrap">
        <table {...props}>{children}</table>
      </div>
    );
  }
};

function MarkdownMessageComponent({ content }: MarkdownMessageProps) {
  const normalizedContent = useMemo(() => normalizeStreamingMarkdown(content), [content]);

  return (
    <div className="markdown-message">
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm]}
        urlTransform={transformMarkdownUrl}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownMessage = memo(MarkdownMessageComponent);

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const label = getLanguageLabel(language);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <figure className="code-block">
      <figcaption>
        <span className="code-language">{label}</span>
        <button type="button" onClick={handleCopy} aria-label="Copy code">
          {copied ? <Check size={15} aria-hidden="true" /> : <Clipboard size={15} aria-hidden="true" />}
          <span>{copied ? "Copied" : "Copy Code"}</span>
        </button>
      </figcaption>
      <pre>
        <code
          className={language ? `hljs language-${language}` : "hljs"}
          dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }}
        />
      </pre>
    </figure>
  );
}

function normalizeStreamingMarkdown(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const fenceCount = normalized.match(/^```/gm)?.length ?? 0;

  if (fenceCount % 2 === 1) {
    return `${normalized}\n\`\`\``;
  }

  return normalized;
}

function getLanguageFromClassName(className: string | undefined) {
  const match = className?.match(/language-([\w-]+)/);
  return match?.[1]?.toLowerCase() ?? "";
}

function getLanguageLabel(language: string) {
  if (!language) {
    return "text";
  }

  return languageLabels[language] ?? language;
}

function highlightCode(code: string, language: string) {
  const normalizedLanguage = languageAliases[language] ?? language;

  if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
    return hljs.highlight(code, { language: normalizedLanguage }).value;
  }

  return escapeHtml(code);
}

const languageAliases: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  ps1: "powershell",
  py: "python",
  rs: "rust",
  sh: "bash",
  ts: "typescript",
  tsx: "typescript",
  txt: "plaintext",
  yml: "yaml"
};

function toText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(toText).join("");
  }

  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }

  if (typeof value === "object" && "props" in value) {
    return toText((value as { props?: { children?: unknown } }).props?.children);
  }

  return String(value);
}

function transformMarkdownUrl(url: string) {
  if (/^(https?:|mailto:|tel:|#|\/|data:image\/)/i.test(url)) {
    return url;
  }

  return "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
