import React, { useState, useEffect } from "react";
import { Menu, Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { ftrackService } from "../services/ftrack";
import { usePlaylistsStore } from "../store/playlistsStore";
import { exportPlaylistNotesToCSV } from "../lib/exportUtils";

interface PlaylistMenuProps {
  onClearAllNotes: () => void;
  onSetAllLabels: (labelId: string) => void;
}

export const PlaylistMenu: React.FC<PlaylistMenuProps> = ({
  onClearAllNotes,
  onSetAllLabels,
}) => {
  const [labels, setLabels] = useState<
    Array<{
      id: string;
      name: string;
      color: string;
    }>
  >([]);

  const { playlists, activePlaylistId } = usePlaylistsStore();

  useEffect(() => {
    const fetchLabels = async () => {
      try {
        const noteLabels = await ftrackService.getNoteLabels();
        setLabels(noteLabels);
      } catch (error) {
        console.error("Failed to fetch note labels:", error);
      }
    };

    fetchLabels();
  }, []);

  const handleExportClick = async () => {
    if (!activePlaylistId) return;
    
    const activePlaylist = playlists.find((p) => p.id === activePlaylistId);
    if (!activePlaylist) return;

    try {
      await exportPlaylistNotesToCSV(activePlaylist);
    } catch (error) {
      console.error("Failed to export notes:", error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="px-2">
          <Menu className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={handleExportClick}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export Notes to CSV
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onClearAllNotes}>
          Clear All Notes
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Set All Labels</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="p-1">
            {labels.map((label) => (
              <DropdownMenuItem
                key={label.id}
                onClick={() => onSetAllLabels(label.id)}
                className="truncate mb-1 last:mb-0 cursor-pointer relative py-2 px-3 rounded-sm flex items-center"
                style={{
                  backgroundColor: label.color || "white",
                  color: getContrastColor(label.color),
                }}
              >
                {label.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
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

  // Use a more aggressive threshold for better contrast
  return luminance > 0.4 ? "#000000" : "#FFFFFF";
}
