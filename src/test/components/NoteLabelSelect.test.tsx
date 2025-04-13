import { describe, it, expect, vi } from "vitest";
import { renderWithUserEvent, screen, waitFor } from "../utils";
import { NoteLabelSelect } from "@/components/NoteLabelSelect";

// Mock stores
vi.mock("@/store/labelStore", () => ({
  useLabelStore: () => ({
    labels: [
      { id: "label1", name: "Bug", color: "#ff0000" },
      { id: "label2", name: "Feature", color: "#00ff00" },
    ],
    isLoading: false,
    error: null,
    fetchLabels: vi.fn(),
  }),
}));

// Mock UI components
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <button data-testid="dropdown-trigger">{children}</button>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <div data-testid="dropdown-item" onClick={onSelect}>
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <div data-testid="dropdown-separator" />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button data-testid="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

// Mock LucideIcons
vi.mock("lucide-react", () => ({
  ChevronDown: () => <span data-testid="chevron-down-icon" />,
  Tag: () => <span data-testid="tag-icon" />,
}));

describe("NoteLabelSelect", () => {
  it("should render with no label selected initially", () => {
    renderWithUserEvent(<NoteLabelSelect value="" onChange={vi.fn()} />);

    // Should show the dropdown trigger with "Add Label" text
    const trigger = screen.getByTestId("dropdown-trigger");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("Add Label");
  });

  it("should display selected label when one is selected", () => {
    renderWithUserEvent(<NoteLabelSelect value="label1" onChange={vi.fn()} />);

    // Should show the selected label name
    const trigger = screen.getByTestId("dropdown-trigger");
    expect(trigger).toHaveTextContent("Bug");
  });

  it("should show dropdown content when clicked", async () => {
    const { user } = renderWithUserEvent(
      <NoteLabelSelect value="" onChange={vi.fn()} />,
    );

    // Click to open dropdown
    const trigger = screen.getByTestId("dropdown-trigger");
    await user.click(trigger);

    // Should show dropdown content
    const content = screen.getByTestId("dropdown-content");
    expect(content).toBeInTheDocument();

    // Should show label items
    const items = screen.getAllByTestId("dropdown-item");
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveTextContent("Bug");
    expect(items[1]).toHaveTextContent("Feature");
  });

  it("should call onLabelSelect when a label is selected", async () => {
    const mockOnLabelSelect = vi.fn();
    const { user } = renderWithUserEvent(
      <NoteLabelSelect value="" onChange={mockOnLabelSelect} />,
    );

    // Click to open dropdown
    const trigger = screen.getByTestId("dropdown-trigger");
    await user.click(trigger);

    // Select first label (Bug)
    const items = screen.getAllByTestId("dropdown-item");
    await user.click(items[0]);

    // Should call onLabelSelect with the selected label ID
    expect(mockOnLabelSelect).toHaveBeenCalledWith("label1");
  });
});
