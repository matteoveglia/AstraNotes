import { describe, it, expect, vi } from "vitest";
import { renderWithUserEvent, screen } from "../utils";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import React from "react";

// Partially mock toast module to include ToastProvider
vi.mock("@/components/ui/toast", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn() }),
    ToastProvider: actual.ToastProvider,
  };
});

// Mock react-markdown
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="markdown-content">{children}</div>
  ),
}));

// Mock markdown extensions
vi.mock("remark-gfm", () => ({ default: vi.fn() }));
vi.mock("rehype-raw", () => ({ default: vi.fn() }));

// Mock CodeMirror editor
vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      data-testid="codemirror-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

describe("MarkdownEditor", () => {
  it("should render a textarea with the given value", () => {
    renderWithUserEvent(
      <MarkdownEditor value="**Test content**" onChange={vi.fn()} />,
    );
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("**Test content**");
  });

  it("should call onChange when content is updated", async () => {
    const mockOnChange = vi.fn();
    function Wrapper() {
      const [val, setVal] = React.useState("Initial content");
      return (
        <MarkdownEditor
          value={val}
          onChange={v => {
            setVal(v);
            mockOnChange(v);
          }}
        />
      );
    }
    const { user } = renderWithUserEvent(<Wrapper />);
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "Updated content");
    expect(mockOnChange).toHaveBeenLastCalledWith("Updated content");
  });
});
