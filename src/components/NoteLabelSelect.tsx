import React, { useEffect, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "../lib/utils";
import { useLabelStore } from "../store/labelStore";
import { useSettings } from "../store/settingsStore";

interface NoteLabelSelectProps {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}

export const NoteLabelSelect: React.FC<NoteLabelSelectProps> = ({
  value,
  onChange,
  className,
}) => {
  const { labels, fetchLabels } = useLabelStore();
  const { settings } = useSettings();
  const hasSetDefault = useRef(false);

  useEffect(() => {
    if (labels.length === 0) {
      fetchLabels();
    }
  }, [fetchLabels]);

  // Set default label only if we don't have a value and haven't set a default before
  useEffect(() => {
    if (!value && labels.length > 0 && !hasSetDefault.current) {
      hasSetDefault.current = true;
      // Use the default label from settings if available, otherwise use the first label
      const defaultLabelId =
        settings.defaultLabelId &&
        labels.find((l) => l.id === settings.defaultLabelId)
          ? settings.defaultLabelId
          : labels[0].id;
      onChange(defaultLabelId);
    }
  }, [value, labels, onChange, settings.defaultLabelId]);

  const selectedLabel = labels.find((label) => label.id === value);

  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger
        className={cn(className, "overflow-hidden")}
        style={{
          backgroundColor: selectedLabel?.color || "white",
          color: selectedLabel?.color
            ? getContrastColor(selectedLabel.color)
            : "inherit",
        }}
      >
        <SelectValue className="truncate">
          {selectedLabel?.name || "Select Label"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="p-1">
        {labels.map((label) => (
          <SelectItem
            key={label.id}
            value={label.id}
            className={cn(
              "truncate mb-1 last:mb-0 cursor-pointer relative",
              "py-2 pl-8 pr-3 rounded-sm flex items-center",
            )}
            style={{
              backgroundColor: label.color,
              color: getContrastColor(label.color),
            }}
          >
            {label.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

// Helper function to determine text color based on background color
function getContrastColor(hexColor: string) {
  // Remove the # if present
  const color = hexColor.replace("#", "");

  // Convert to RGB
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);

  // Calculate relative luminance using sRGB
  const sRGB = [r / 255, g / 255, b / 255].map((val) => {
    if (val <= 0.03928) {
      return val / 12.92;
    }
    return Math.pow((val + 0.055) / 1.055, 2.4);
  });

  const luminance = 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];

  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}
