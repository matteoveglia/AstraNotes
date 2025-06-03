/**
 * @fileoverview MarkdownRenderer.tsx
 * A lightweight markdown renderer for displaying GitHub release notes.
 * Handles basic markdown formatting without external dependencies.
 * @component
 */

import React from "react";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-shell";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className,
}) => {
  const parseMarkdown = (text: string): React.ReactNode[] => {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let currentList: React.ReactNode[] = [];
    let listType: "ul" | "ol" | null = null;
    let key = 0;

    const flushList = () => {
      if (currentList.length > 0) {
        elements.push(
          listType === "ul" ? (
            <ul key={`list-${key++}`} className="list-disc list-inside space-y-1 mb-4">
              {currentList}
            </ul>
          ) : (
            <ol key={`list-${key++}`} className="list-decimal list-inside space-y-1 mb-4">
              {currentList}
            </ol>
          ),
        );
        currentList = [];
        listType = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines
      if (line.trim() === "") {
        flushList();
        continue;
      }

      // Headers
      if (line.startsWith("# ")) {
        flushList();
        elements.push(
          <h1 key={`h1-${key++}`} className="text-2xl font-bold mb-4">
            {line.substring(2)}
          </h1>,
        );
        continue;
      }

      if (line.startsWith("## ")) {
        flushList();
        elements.push(
          <h2 key={`h2-${key++}`} className="text-xl font-semibold mb-3">
            {line.substring(3)}
          </h2>,
        );
        continue;
      }

      if (line.startsWith("### ")) {
        flushList();
        elements.push(
          <h3 key={`h3-${key++}`} className="text-lg font-medium mb-2">
            {line.substring(4)}
          </h3>,
        );
        continue;
      }

      // Unordered list items
      if (line.match(/^\s*[-*+]\s/)) {
        if (listType !== "ul") {
          flushList();
          listType = "ul";
        }
        const content = line.replace(/^\s*[-*+]\s/, "");
        currentList.push(
          <li key={`li-${key++}`} className="ml-4">
            {renderInline(content)}
          </li>,
        );
        continue;
      }

      // Ordered list items
      if (line.match(/^\s*\d+\.\s/)) {
        if (listType !== "ol") {
          flushList();
          listType = "ol";
        }
        const content = line.replace(/^\s*\d+\.\s/, "");
        currentList.push(
          <li key={`li-${key++}`} className="ml-4">
            {renderInline(content)}
          </li>,
        );
        continue;
      }

      // Regular paragraph
      flushList();
      if (line.trim()) {
        elements.push(
          <p key={`p-${key++}`} className="mb-3 leading-relaxed">
            {renderInline(line)}
          </p>,
        );
      }
    }

    flushList();
    return elements;
  };

  const handleLinkClick = async (url: string) => {
    try {
      await open(url);
    } catch (error) {
      console.error("Failed to open URL:", error);
      // Fallback to window.open for web builds
      window.open(url, "_blank");
    }
  };

  const renderInline = (text: string): React.ReactNode => {
    let result: React.ReactNode = text;
    let key = 0;

    // URLs - match http/https URLs
    result = (result as string).split(/(https?:\/\/[^\s]+)/).map((part, index) => {
      if (part.match(/^https?:\/\//)) {
        return (
          <button
            key={`url-${key++}-${index}`}
            onClick={() => handleLinkClick(part)}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline cursor-pointer"
          >
            {part}
          </button>
        );
      }
      return part;
    });

    // Bold text **text**
    if (Array.isArray(result)) {
      result = result.flatMap((node, nodeIndex) => {
        if (typeof node === "string") {
          return node.split(/(\*\*[^*]+\*\*)/).map((part, partIndex) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={`bold-${key++}-${nodeIndex}-${partIndex}`} className="font-semibold">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return part;
          });
        }
        return node;
      });
    } else {
      result = (result as string).split(/(\*\*[^*]+\*\*)/).map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={`bold-${key++}-${index}`} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });
    }

    // Flatten and process italic
    const processItalic = (nodes: React.ReactNode[]): React.ReactNode[] => {
      return nodes.flatMap((node, nodeIndex) => {
        if (typeof node === "string") {
          return node.split(/(\*[^*]+\*)/).map((part, partIndex) => {
            if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
              return (
                <em key={`italic-${key++}-${nodeIndex}-${partIndex}`} className="italic">
                  {part.slice(1, -1)}
                </em>
              );
            }
            return part;
          });
        }
        return node;
      });
    };

    if (Array.isArray(result)) {
      result = processItalic(result);
    }

    // Code inline `code`
    const processCode = (nodes: React.ReactNode[]): React.ReactNode[] => {
      return nodes.flatMap((node, nodeIndex) => {
        if (typeof node === "string") {
          return node.split(/(`[^`]+`)/).map((part, partIndex) => {
            if (part.startsWith("`") && part.endsWith("`")) {
              return (
                <code
                  key={`code-${key++}-${nodeIndex}-${partIndex}`}
                  className="bg-muted px-1 py-0.5 rounded text-sm font-mono"
                >
                  {part.slice(1, -1)}
                </code>
              );
            }
            return part;
          });
        }
        return node;
      });
    };

    if (Array.isArray(result)) {
      result = processCode(result);
    }

    return result;
  };

  return (
    <div className={cn("prose prose-sm max-w-none", className)}>
      {parseMarkdown(content)}
    </div>
  );
}; 