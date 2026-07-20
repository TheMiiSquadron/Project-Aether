import { MarkdownMessage } from "./MarkdownMessage";

export const markdownShowcase = `# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

Paragraph text with **bold**, *italic*, ***bold italic***, ~~strikethrough~~, and \`inline code\`.

Autolink: https://example.com/aether

[Named link](https://example.com/named)

![Aether placeholder image](https://example.com/aether.png)

---

> A blockquote should carry the theme accent.
>
> It can include **formatted text** and \`inline code\`.

- Unordered item
- Another unordered item
  - Nested unordered item

1. Ordered item
2. Another ordered item
   1. Nested ordered item

- [x] Completed task
- [ ] Open task

| Feature | Status | Notes |
| --- | --- | --- |
| Tables | Supported | Wider content should scroll horizontally. |
| Task lists | Supported | Native-looking checkboxes. |
| Autolinks | Supported | https://example.com/table-link |

\`\`\`ts
type Message = {
  role: "user" | "assistant";
  content: string;
};

export function summarize(message: Message) {
  return message.content.trim();
}
\`\`\`

\`\`\`rust
pub fn conversation_title(input: &str) -> String {
    input.trim().chars().take(64).collect()
}
\`\`\`

\`\`\`json
{
  "project": "Aether",
  "markdown": true,
  "features": ["gfm", "tables", "task-lists"]
}
\`\`\`

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}."
\`\`\`

\`\`\`bash
npm test
npm run build
\`\`\`

\`\`\`
Plain text keeps    spacing
and indentation.
\`\`\``;

export function MarkdownShowcase() {
  return (
    <section className="markdown-showcase" aria-label="Markdown showcase">
      <MarkdownMessage content={markdownShowcase} />
    </section>
  );
}
