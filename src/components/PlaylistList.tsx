/**
 * @fileoverview PlaylistList.tsx
 * Component for available playlist management and display with carousel support.
 * Features dynamic loading, selection functionality, current playlist
 * indication, loading/error state handling, and category-based organization
 * supporting both review sessions and ftrack lists.
 * @component
 */

import React from "react";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Playlist, PlaylistCategory } from "@/types";
import { ftrackService } from "../services/ftrack";

interface PlaylistListProps {
  onSelect: (playlist: Playlist) => void;
  activePlaylistId: string | null;
}

export const PlaylistList: React.FC<PlaylistListProps> = ({
  onSelect,
  activePlaylistId,
}) => {
  const [categories, setCategories] = React.useState<PlaylistCategory[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [currentCategoryIndex, setCurrentCategoryIndex] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadPlaylistCategories = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedCategories = await ftrackService.getPlaylistCategories();
        setCategories(fetchedCategories);
        
        // Reset to first category if current index is out of bounds
        if (fetchedCategories.length > 0 && currentCategoryIndex >= fetchedCategories.length) {
          setCurrentCategoryIndex(0);
        }
      } catch (error) {
        console.error("Failed to load playlist categories:", error);
        setError("Failed to load playlists");
      } finally {
        setLoading(false);
      }
    };

    loadPlaylistCategories();
  }, []);

  const handlePreviousCategory = () => {
    setCurrentCategoryIndex((prev) => 
      prev > 0 ? prev - 1 : categories.length - 1
    );
  };

  const handleNextCategory = () => {
    setCurrentCategoryIndex((prev) => 
      prev < categories.length - 1 ? prev + 1 : 0
    );
  };

  const currentCategory = categories[currentCategoryIndex];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-sm text-zinc-500">Loading playlists...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-sm text-red-500">{error}</div>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-sm text-zinc-500">No playlists found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {/* Category Navigation Header */}
        {categories.length > 1 && (
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviousCategory}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex-1 text-center">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {currentCategory?.name}
              </h3>
              <div className="flex justify-center gap-1 mt-1">
                {categories.map((_, index) => {
                  // Check if this category contains the active playlist
                  const containsActivePlaylist = activePlaylistId && 
                    categories[index]?.playlists.some(p => p.id === activePlaylistId);
                  
                  return (
                    <div
                      key={index}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full transition-colors relative",
                        index === currentCategoryIndex 
                          ? "bg-blue-500" 
                          : "bg-zinc-300 dark:bg-zinc-600"
                      )}
                    >
                      {containsActivePlaylist && (
                        <div className="absolute inset-0 rounded-full ring-2 ring-blue-300 ring-offset-1" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNextCategory}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Current Category Header (when only one category) */}
        {categories.length === 1 && currentCategory && (
          <div className="text-center">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {currentCategory.name}
            </h3>
          </div>
        )}

        {/* Playlist Grid */}
        {currentCategory && (
          <div className="flex flex-col gap-1">
            {currentCategory.playlists.length === 0 ? (
              <div className="text-sm text-zinc-500 px-2">
                No playlists in this category
              </div>
            ) : (
              currentCategory.playlists.map((playlist) => {
                const isSelected = playlist.id === activePlaylistId && activePlaylistId !== '__no_selection__';
                return (
                  <Button
                    key={playlist.id}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => onSelect(playlist)}
                    className={cn(
                      "w-full justify-start text-left",
                      playlist.type === 'list' && "border-dashed"
                    )}
                    title={
                      playlist.type === 'list' 
                        ? `ftrack List: ${playlist.name}${playlist.isOpen ? ' (Open)' : ' (Closed)'}`
                        : `Review Session: ${playlist.name}`
                    }
                  >
                    <span className="truncate flex-1">{playlist.name}</span>
                    {playlist.type === 'list' && (
                      <span className={cn(
                        "ml-1 text-xs flex-shrink-0",
                        playlist.isOpen ? "text-green-700" : "opacity-70"
                      )}>
                        {playlist.isOpen ? '●' : '○'}
                      </span>
                    )}
                  </Button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Pinned Footer */}
      {currentCategory && (
        <div className="border-t pt-2 mt-2 flex-shrink-0">
          <div className="text-xs text-zinc-400 text-center">
            {currentCategory.type === 'reviewsessions' 
              ? 'Review Sessions' 
              : 'Lists'
            } • {currentCategory.playlists.length} playlist{currentCategory.playlists.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
};
