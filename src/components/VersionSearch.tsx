import React, { useState, useCallback, useEffect } from 'react';
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useDebounce } from '../hooks/useDebounce';
import { AssetVersion } from '../types';
import { ftrackService } from '../services/ftrack';

interface VersionSearchProps {
  onVersionSelect: (version: AssetVersion) => void;
  onClearAdded: () => void;
  onClearAll: () => void;
  hasManuallyAddedVersions?: boolean;
  isQuickNotes?: boolean;
}

export const VersionSearch: React.FC<VersionSearchProps> = ({ 
  onVersionSelect, 
  onClearAdded, 
  onClearAll,
  hasManuallyAddedVersions = false,
  isQuickNotes = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<AssetVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const handleSearch = useCallback(async () => {
    if (!debouncedSearchTerm) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const versions = await ftrackService.searchVersions({
        searchTerm: debouncedSearchTerm,
      });
      setResults(versions);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearchTerm]);

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search by asset name or version (e.g. 'shot_010' or 'v2')"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onClearAdded}
          disabled={!hasManuallyAddedVersions}
        >
          Clear Added Versions
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onClearAll}
          disabled={!isQuickNotes}
        >
          Clear All Versions
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-2 text-sm text-gray-500">Loading...</div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-4 gap-1.5 max-h-[300px] overflow-y-auto">
          {results.map((version) => (
            <div
              key={version.id}
              className="border rounded p-1.5 cursor-pointer hover:bg-gray-100 text-xs"
              onClick={() => {
                if (onVersionSelect) {
                  onVersionSelect(version);
                  setSearchTerm(''); // Clear search after selection
                  setResults([]); // Clear results after selection
                }
              }}
            >
              {version.thumbnailUrl && (
                <img
                  src={version.thumbnailUrl}
                  alt={version.name}
                  className="w-full h-16 object-cover mb-1"
                />
              )}
              <div className="font-medium truncate">{version.name}</div>
              <div className="text-gray-500">
                v{version.version}
              </div>
            </div>
          ))}
        </div>
      ) : debouncedSearchTerm ? (
        <div className="text-center py-2 text-sm text-gray-500">No results found</div>
      ) : null}
    </div>
  );
};
