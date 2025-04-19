/**
 * @fileoverview MarkdownEditor.tsx
 * A lightweight markdown editor component that uses Lucide icons and integrates with the app's design system.
 * @component
 */

import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import {
  Bold,
  Italic,
  Heading,
  List,
  ListOrdered,
  Link as LinkIcon,
} from "lucide-react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: string;
}

// Export the processContentForFtrack function type for use in other components
export interface MarkdownEditorRef {
  processContentForFtrack: (content: string) => string;
}

export const MarkdownEditor = forwardRef<
  MarkdownEditorRef,
  MarkdownEditorProps
>(
  (
    {
      value,
      onChange,
      placeholder = "Add a note...",
      disabled = false,
      className,
      minHeight = "40px",
    },
    ref,
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    // Process content for ftrack to ensure proper line breaks
    const processContentForFtrack = (content: string) => {
      // Replace single newlines with double newlines for proper markdown rendering
      return content.replace(/\n/g, "\n\n");
    };

    // Expose methods to parent components
    useImperativeHandle(ref, () => ({
      processContentForFtrack,
    }));

    const autoResizeTextarea = (textarea: HTMLTextAreaElement) => {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(200, Math.max(40, textarea.scrollHeight))}px`;
    };

    useEffect(() => {
      if (textareaRef.current) {
        autoResizeTextarea(textareaRef.current);
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    };

    const handleFocus = () => {
      setIsFocused(true);
    };

    const handleBlur = () => {
      setIsFocused(false);
    };

    // Handle key presses for auto-continuing lists
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !disabled) {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const cursorPos = textarea.selectionStart;
        const currentValue = textarea.value;

        // Get the current line
        const textBeforeCursor = currentValue.substring(0, cursorPos);
        const lastNewLineIndex = textBeforeCursor.lastIndexOf("\n");
        const currentLine = textBeforeCursor.substring(lastNewLineIndex + 1);

        // Check if the current line is a list item
        const unorderedListMatch = currentLine.match(/^(\s*)-\s(.*)$/);
        const orderedListMatch = currentLine.match(/^(\s*)(\d+)\.\s(.*)$/);

        if (unorderedListMatch) {
          // If the current line is empty except for the bullet, break out of the list
          if (!unorderedListMatch[2].trim()) {
            e.preventDefault();
            const newText =
              textBeforeCursor.substring(
                0,
                textBeforeCursor.length - currentLine.length,
              ) + currentValue.substring(cursorPos);
            onChange(newText);
            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd =
                textBeforeCursor.length - currentLine.length;
            }, 0);
            return;
          }

          // Continue unordered list
          e.preventDefault();
          const indent = unorderedListMatch[1];
          const newText =
            currentValue.substring(0, cursorPos) +
            `\n${indent}- ` +
            currentValue.substring(cursorPos);
          onChange(newText);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd =
              cursorPos + 2 + indent.length + 1;
          }, 0);
        } else if (orderedListMatch) {
          // If the current line is empty except for the number, break out of the list
          if (!orderedListMatch[3].trim()) {
            e.preventDefault();
            const newText =
              textBeforeCursor.substring(
                0,
                textBeforeCursor.length - currentLine.length,
              ) + currentValue.substring(cursorPos);
            onChange(newText);
            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd =
                textBeforeCursor.length - currentLine.length;
            }, 0);
            return;
          }

          // Continue ordered list with incremented number
          e.preventDefault();
          const indent = orderedListMatch[1];
          const currentNumber = parseInt(orderedListMatch[2], 10);
          const nextNumber = currentNumber + 1;
          const newText =
            currentValue.substring(0, cursorPos) +
            `\n${indent}${nextNumber}. ` +
            currentValue.substring(cursorPos);
          onChange(newText);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd =
              cursorPos + 2 + indent.length + nextNumber.toString().length + 1;
          }, 0);
        }
      }
    };

    const insertBold = () => {
      if (!textareaRef.current || disabled) return;

      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);

      // If no text is selected, just insert the markers and place cursor between them
      if (start === end) {
        const newText =
          value.substring(0, start) + "**" + "**" + value.substring(end);
        onChange(newText);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + 2, start + 2);
        }, 0);
        return;
      }

      // Trim the selected text to avoid issues with whitespace in markdown
      const trimmedText = selectedText.trim();
      const startOffset = selectedText.length - selectedText.trimStart().length;
      const endOffset = selectedText.length - selectedText.trimEnd().length;

      // Create new text with proper formatting - whitespace outside the bold markers
      const newText =
        value.substring(0, start) +
        selectedText.substring(0, startOffset) +
        "**" +
        trimmedText +
        "**" +
        selectedText.substring(selectedText.length - endOffset) +
        value.substring(end);

      onChange(newText);

      // Set cursor position after the operation
      setTimeout(() => {
        textarea.focus();
        const newStart = start + startOffset + 2;
        const newEnd = start + selectedText.length - endOffset + 2;
        textarea.setSelectionRange(newStart, newEnd);
      }, 0);
    };

    const insertItalic = () => {
      if (!textareaRef.current || disabled) return;

      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);

      // If no text is selected, just insert the markers and place cursor between them
      if (start === end) {
        const newText =
          value.substring(0, start) + "*" + "*" + value.substring(end);
        onChange(newText);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + 1, start + 1);
        }, 0);
        return;
      }

      // Trim the selected text to avoid issues with whitespace in markdown
      const trimmedText = selectedText.trim();
      const startOffset = selectedText.length - selectedText.trimStart().length;
      const endOffset = selectedText.length - selectedText.trimEnd().length;

      // Create new text with proper formatting - whitespace outside the italic markers
      const newText =
        value.substring(0, start) +
        selectedText.substring(0, startOffset) +
        "*" +
        trimmedText +
        "*" +
        selectedText.substring(selectedText.length - endOffset) +
        value.substring(end);

      onChange(newText);

      // Set cursor position after the operation
      setTimeout(() => {
        textarea.focus();
        const newStart = start + startOffset + 1;
        const newEnd = start + selectedText.length - endOffset + 1;
        textarea.setSelectionRange(newStart, newEnd);
      }, 0);
    };

    const insertHeading = () => {
      if (!textareaRef.current || disabled) return;

      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);

      const beforeText = value.substring(0, start);
      const afterText = value.substring(end);

      // Trim whitespace from the selected text for formatting
      const trimmedText = selectedText.trim();

      // Adjust selection range based on trimming
      const startOffset = selectedText.length - selectedText.trimStart().length;
      const endOffset = selectedText.length - selectedText.trimEnd().length;

      // Create new text with proper formatting
      let newText;
      if (selectedText.length > 0 && (startOffset > 0 || endOffset > 0)) {
        // If there's whitespace in the selection, preserve it outside the formatting
        newText =
          beforeText +
          selectedText.substring(0, startOffset) +
          "## " +
          trimmedText +
          selectedText.substring(selectedText.length - endOffset) +
          afterText;
      } else {
        // Normal case - no whitespace trimming needed
        newText = beforeText + "## " + selectedText + afterText;
      }

      onChange(newText);

      // Set cursor position after the operation
      setTimeout(() => {
        textarea.focus();
        if (selectedText.length > 0) {
          const newStart = start + startOffset + 3;
          const newEnd = start + selectedText.length - endOffset + 3;
          textarea.setSelectionRange(newStart, newEnd);
        } else {
          textarea.setSelectionRange(start + 3, end + 3);
        }
      }, 0);
    };

    const insertUnorderedList = () => {
      if (!textareaRef.current || disabled) return;

      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);

      const beforeText = value.substring(0, start);
      const afterText = value.substring(end);

      // Trim whitespace from the selected text for formatting
      const trimmedText = selectedText.trim();

      // Adjust selection range based on trimming
      const startOffset = selectedText.length - selectedText.trimStart().length;
      const endOffset = selectedText.length - selectedText.trimEnd().length;

      // Create new text with proper formatting
      let newText;
      if (selectedText.length > 0 && (startOffset > 0 || endOffset > 0)) {
        // If there's whitespace in the selection, preserve it outside the formatting
        newText =
          beforeText +
          selectedText.substring(0, startOffset) +
          "- " +
          trimmedText +
          selectedText.substring(selectedText.length - endOffset) +
          afterText;
      } else {
        // Normal case - no whitespace trimming needed
        newText = beforeText + "- " + selectedText + afterText;
      }

      onChange(newText);

      // Set cursor position after the operation
      setTimeout(() => {
        textarea.focus();
        if (selectedText.length > 0) {
          const newStart = start + startOffset + 2;
          const newEnd = start + selectedText.length - endOffset + 2;
          textarea.setSelectionRange(newStart, newEnd);
        } else {
          textarea.setSelectionRange(start + 2, end + 2);
        }
      }, 0);
    };

    const insertOrderedList = () => {
      if (!textareaRef.current || disabled) return;

      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);

      const beforeText = value.substring(0, start);
      const afterText = value.substring(end);

      // Trim whitespace from the selected text for formatting
      const trimmedText = selectedText.trim();

      // Adjust selection range based on trimming
      const startOffset = selectedText.length - selectedText.trimStart().length;
      const endOffset = selectedText.length - selectedText.trimEnd().length;

      // Create new text with proper formatting
      let newText;
      if (selectedText.length > 0 && (startOffset > 0 || endOffset > 0)) {
        // If there's whitespace in the selection, preserve it outside the formatting
        newText =
          beforeText +
          selectedText.substring(0, startOffset) +
          "1. " +
          trimmedText +
          selectedText.substring(selectedText.length - endOffset) +
          afterText;
      } else {
        // Normal case - no whitespace trimming needed
        newText = beforeText + "1. " + selectedText + afterText;
      }

      onChange(newText);

      // Set cursor position after the operation
      setTimeout(() => {
        textarea.focus();
        if (selectedText.length > 0) {
          const newStart = start + startOffset + 3;
          const newEnd = start + selectedText.length - endOffset + 3;
          textarea.setSelectionRange(newStart, newEnd);
        } else {
          textarea.setSelectionRange(start + 3, end + 3);
        }
      }, 0);
    };

    const insertLink = () => {
      if (!textareaRef.current || disabled) return;

      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);

      const beforeText = value.substring(0, start);
      const afterText = value.substring(end);

      // Trim whitespace from the selected text for formatting
      const trimmedText = selectedText.trim();

      // Adjust selection range based on trimming
      const startOffset = selectedText.length - selectedText.trimStart().length;
      const endOffset = selectedText.length - selectedText.trimEnd().length;

      // Create new text with proper formatting
      let newText;
      if (selectedText.length > 0 && (startOffset > 0 || endOffset > 0)) {
        // If there's whitespace in the selection, preserve it outside the formatting
        newText =
          beforeText +
          selectedText.substring(0, startOffset) +
          "[" +
          trimmedText +
          "](url)" +
          selectedText.substring(selectedText.length - endOffset) +
          afterText;
      } else {
        // Normal case - no whitespace trimming needed
        newText = beforeText + "[" + selectedText + "](url)" + afterText;
      }

      onChange(newText);

      // Set cursor position after the operation
      setTimeout(() => {
        textarea.focus();
        if (selectedText.length > 0) {
          const newStart = start + startOffset + 1;
          const newEnd = start + selectedText.length - endOffset + 1;
          textarea.setSelectionRange(newStart, newEnd);
        } else {
          textarea.setSelectionRange(start + 1, end + 1);
        }
      }, 0);
    };

    // Show toolbar only when focused and not disabled
    const showToolbar = isFocused && !disabled;

    return (
      <div className={cn("markdown-editor", className)}>
        {!disabled && (
          <div
            className={cn(
              "flex items-center gap-1 p-1 border-b-0 rounded-t-md transition-all duration-200",
              showToolbar
                ? "bg-zinc-50 dark:bg-zinc-800 opacity-100"
                : "bg-zinc-50 dark:bg-zinc-800 opacity-30",
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={insertBold}
              disabled={disabled}
              title="Bold"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={insertItalic}
              disabled={disabled}
              title="Italic"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={insertHeading}
              disabled={disabled}
              title="Heading"
            >
              <Heading className="h-4 w-4" />
            </Button>
            <div className="h-4 w-px bg-zinc-300 mx-1" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={insertUnorderedList}
              disabled={disabled}
              title="Bullet List"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={insertOrderedList}
              disabled={disabled}
              title="Numbered List"
            >
              <ListOrdered className="h-4 w-4" />
            </Button>
            <div className="h-4 w-px bg-zinc-300 mx-1" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={insertLink}
              disabled={disabled}
              title="Link"
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "resize-none transition-all duration-200",
            !disabled && "rounded-t-none",
            disabled
              ? "overflow-y-auto pointer-events-auto cursor-default"
              : "min-h-[40px]",
          )}
          style={{
            minHeight,
            // Allow scrolling even when disabled
            ...(disabled && {
              opacity: 0.7,
              WebkitUserSelect: "text",
              userSelect: "text",
            }),
          }}
          disabled={disabled}
          spellCheck={false}
          readOnly={disabled}
        />
      </div>
    );
  },
);
