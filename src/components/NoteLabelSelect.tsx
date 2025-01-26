import React, { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ftrackService } from "../services/ftrack";

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
  const [labels, setLabels] = useState<Array<{
    id: string;
    name: string;
    color: string;
  }>>([]);

  useEffect(() => {
    const fetchLabels = async () => {
      try {
        const noteLabels = await ftrackService.getNoteLabels();
        setLabels(noteLabels);
        // Set default value to first label if no value is selected
        if (!value && noteLabels.length > 0) {
          onChange(noteLabels[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch note labels:", error);
      }
    };

    fetchLabels();
  }, []); // Remove value and onChange from dependencies

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue>
          {labels.find((label) => label.id === value)?.name || "Select Label"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {labels.map((label) => (
          <SelectItem
            key={label.id}
            value={label.id}
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
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black or white based on luminance
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}
