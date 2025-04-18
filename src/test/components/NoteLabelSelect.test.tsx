// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderWithUserEvent, screen } from "../utils";
import { NoteLabelSelect } from "@/components/NoteLabelSelect";

// Mock label store
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

// Mock settings store (no defaultLabelId)
vi.mock("@/store/settingsStore", () => ({
  useSettings: () => ({ settings: { defaultLabelId: "" } }),
}));

// Mock Radix Select primitives to simple HTML equivalents
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children, disabled }: any) => (
    <select
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      disabled={disabled}
      data-testid="mock-select"
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children, ...props }: any) => <>{children}</>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children, ...props }: any) => (
    <option value={value} {...props}>
      {children}
    </option>
  ),
  SelectValue: ({ children }: any) => <>{children}</>,
}));

// Mock LucideIcons
vi.mock("lucide-react", () => ({
  ChevronDown: () => <span data-testid="chevron-down-icon" />,
  Tag: () => <span data-testid="tag-icon" />,
  Check: () => <span data-testid="check-icon" />,
}));

describe("NoteLabelSelect", () => {
  it("should render with default first label when no value provided", () => {
    const mockOnChange = vi.fn();
    renderWithUserEvent(<NoteLabelSelect value="" onChange={mockOnChange} />);

    // Should show first label name as default
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("Bug");
    // onChange should be called once with default label ID
    expect(mockOnChange).toHaveBeenCalledWith("label1");
  });

  it("should display selected label when one is selected", () => {
    renderWithUserEvent(<NoteLabelSelect value="label1" onChange={vi.fn()} />);

    // Should show the selected label name
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Bug");
  });

  it("should show dropdown content when clicked", async () => {
    const { user } = renderWithUserEvent(
      <NoteLabelSelect value="" onChange={vi.fn()} />,
    );

    // Click to open dropdown
    const trigger = screen.getByRole("combobox");
    await user.click(trigger);

    // Should show dropdown options as role option
    expect(screen.getByRole("option", { name: "Bug" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Feature" })).toBeInTheDocument();
  });

  it("should call onLabelSelect when a label is selected", async () => {
    const mockOnLabelSelect = vi.fn();
    const { user } = renderWithUserEvent(
      <NoteLabelSelect value="" onChange={mockOnLabelSelect} />,
    );

    // Click to open dropdown
    const trigger = screen.getByRole("combobox");
    await user.click(trigger);

    // Select first label (Bug)
    await user.click(screen.getByRole("option", { name: "Bug" }));

    // Should call onLabelSelect with the selected label ID
    expect(mockOnLabelSelect).toHaveBeenCalledWith("label1");
  });
});
