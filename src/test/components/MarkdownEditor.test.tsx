import { describe, it, expect, vi } from "vitest";
import { renderWithUserEvent, screen } from "../utils";
import { MarkdownEditor } from "@/components/MarkdownEditor";

// Mock dependencies
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock react-markdown
vi.mock("react-markdown", () => ({
  default: ({ children }) => (
    <div data-testid="markdown-content">{children}</div>
  ),
}));

// Mock markdown extensions
vi.mock("remark-gfm", () => ({ default: vi.fn() }));
vi.mock("rehype-raw", () => ({ default: vi.fn() }));

// Mock CodeMirror editor
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange }) => (
    <textarea
      data-testid="codemirror-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

describe("MarkdownEditor", () => {
  it("should render in read mode by default", () => {
    renderWithUserEvent(
      <MarkdownEditor content="**Test content**" onChange={vi.fn()} />,
    );

    // Should render the markdown content
    const markdownContent = screen.getByTestId("markdown-content");
    expect(markdownContent).toBeInTheDocument();
    expect(markdownContent).toHaveTextContent("**Test content**");
  });

  it("should switch to edit mode when clicked", async () => {
    const { user } = renderWithUserEvent(
      <MarkdownEditor content="Test content" onChange={vi.fn()} />,
    );

    // Click to edit
    const markdownContent = screen.getByTestId("markdown-content");
    await user.click(markdownContent);

    // Should show editor in edit mode
    const editor = screen.getByTestId("codemirror-editor");
    expect(editor).toBeInTheDocument();
    expect(editor).toHaveValue("Test content");
  });

  it("should call onChange when content is updated", async () => {
    const mockOnChange = vi.fn();
    const { user } = renderWithUserEvent(
      <MarkdownEditor content="Initial content" onChange={mockOnChange} />,
    );

    // Click to edit
    const markdownContent = screen.getByTestId("markdown-content");
    await user.click(markdownContent);

    // Edit content
    const editor = screen.getByTestId("codemirror-editor");
    await user.clear(editor);
    await user.type(editor, "Updated content");

    // Exit edit mode (click outside)
    await user.tab();

    // Should call onChange with new content
    expect(mockOnChange).toHaveBeenCalledWith("Updated content");
  });
});
