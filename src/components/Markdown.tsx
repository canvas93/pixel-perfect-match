import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { ChartBlock, parseChartSpec } from "./ChartBlock";

function CodeBlock({ children, raw }: { children: ReactNode; raw: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(raw);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-md bg-secondary/80 p-1.5 text-muted-foreground opacity-0 transition group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

function textOf(node: any): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node?.props?.children) return textOf(node.props.children);
  return "";
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true, detect: false }]]}
        components={{
          pre({ children }) {
            const child: any = Array.isArray(children) ? children[0] : children;
            const cls: string = child?.props?.className ?? "";
            const raw = textOf(child?.props?.children);
            if (/language-(chart|graph|json)/.test(cls)) {
              const spec = parseChartSpec(raw, /language-(chart|graph)/.test(cls));
              if (spec) return <ChartBlock spec={spec} />;
            }
            return <CodeBlock raw={raw}>{children}</CodeBlock>;
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto rounded-lg border">
                <table>{children}</table>
              </div>
            );
          },
          a({ children, href }) {
            return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
