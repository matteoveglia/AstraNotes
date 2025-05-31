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

interface PlaylistWithStatus extends Playlist {
  status?: "added" | "removed";
}

interface PlaylistCategoryWithStatus extends Omit<PlaylistCategory, 'playlists'> {
  playlists: PlaylistWithStatus[];
}

interface PlaylistListProps {
  categories: PlaylistCategoryWithStatus[];
  loading?: boolean;
  error?: string | null;
  onSelect: (playlist: Playlist) => void;
  activePlaylistId: string | null;
}

export const PlaylistList: React.FC<PlaylistListProps> = ({
  categories,
  loading = false,
  error = null,
  onSelect,
  activePlaylistId,
}) => {
  const [currentCategoryIndex, setCurrentCategoryIndex] = React.useState(0);
  const [previousCategoriesRef] = React.useState<{ current: PlaylistCategoryWithStatus[] }>({ current: [] });
  const [userHasNavigated, setUserHasNavigated] = React.useState(false);

  // Smart category index management when categories change (but not when user navigates)
  React.useEffect(() => {
    if (categories.length === 0) {
      setCurrentCategoryIndex(0);
      return;
    }

    const previousCategories = previousCategoriesRef.current;
    const hadCategories = previousCategories.length > 0;

    // If this is the first time we have categories, stay at 0
    if (!hadCategories) {
      previousCategoriesRef.current = categories;
      return;
    }

    // Only do automatic navigation if user hasn't manually navigated
    if (!userHasNavigated) {
      // Try to find the category that contains the active playlist
      if (activePlaylistId) {
        const categoryWithActivePlaylist = categories.findIndex(cat => 
          cat.playlists.some(p => p.id === activePlaylistId)
        );
        
        if (categoryWithActivePlaylist !== -1) {
          setCurrentCategoryIndex(categoryWithActivePlaylist);
          previousCategoriesRef.current = categories;
          return;
        }
      }
    }

    // Try to maintain the same category by ID if it still exists
    const currentCategory = previousCategories[currentCategoryIndex];
    if (currentCategory) {
      const sameCategoryIndex = categories.findIndex(cat => cat.id === currentCategory.id);
      if (sameCategoryIndex !== -1) {
        setCurrentCategoryIndex(sameCategoryIndex);
        previousCategoriesRef.current = categories;
        return;
      }
    }

    // If current index is out of bounds, reset to 0
    if (currentCategoryIndex >= categories.length) {
      setCurrentCategoryIndex(0);
      setUserHasNavigated(false); // Reset user navigation flag when forced to change
    }

    previousCategoriesRef.current = categories;
  }, [categories, currentCategoryIndex, activePlaylistId, userHasNavigated]);

  const handlePreviousCategory = () => {
    setUserHasNavigated(true); // Mark that user has manually navigated
    setCurrentCategoryIndex((prev) => 
      prev > 0 ? prev - 1 : categories.length - 1
    );
  };

  const handleNextCategory = () => {
    setUserHasNavigated(true); // Mark that user has manually navigated
    setCurrentCategoryIndex((prev) => 
      prev < categories.length - 1 ? prev + 1 : 0
    );
  };

  // Reset user navigation flag when active playlist changes to allow automatic navigation
  React.useEffect(() => {
    setUserHasNavigated(false);
  }, [activePlaylistId]);

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
              currentCategory.playlists.map((playlist: PlaylistWithStatus) => {
                const isSelected = playlist.id === activePlaylistId && activePlaylistId !== '__no_selection__';
                const status = playlist.status;
                
                return (
                  <Button
                    key={playlist.id}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => onSelect(playlist)}
                    className={cn(
                      "w-full justify-start text-left",
                      playlist.type === 'list' && "border-dashed",
                      status === "removed" && "text-red-500 border-red-300",
                      status === "added" && "text-green-600 border-green-300"
                    )}
                    title={
                      playlist.type === 'list' 
                        ? `ftrack List: ${playlist.name}${playlist.isOpen ? ' (Open)' : ' (Closed)'}`
                        : `Review Session: ${playlist.name}`
                    }
                  >
                    <span className="truncate flex-1">{playlist.name}</span>
                    <div className="flex items-center gap-1">
                      {playlist.type === 'list' && (
                        <span className={cn(
                          "text-xs flex-shrink-0",
                          playlist.isOpen ? "text-green-700" : "opacity-70"
                        )}>
                          {playlist.isOpen ? '●' : '○'}
                        </span>
                      )}
                      {status === "removed" && (
                        <span className="text-red-500 text-xs">-</span>
                      )}
                      {status === "added" && (
                        <span className="text-green-600 text-xs">+</span>
                      )}
                    </div>
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
