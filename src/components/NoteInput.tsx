import React, { useState } from 'react';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { NoteStatus } from '../types';
import { cn } from '../lib/utils';

interface NoteInputProps {
  onSave: () => void;
  onClear: () => void;
  status: NoteStatus;
  selected: boolean;
  onSelectToggle: () => void;
  versionName: string;
  versionNumber: string;
  thumbnailUrl?: string;
}

export function NoteInput({
  onSave,
  onClear,
  status,
  selected,
  onSelectToggle,
  versionName,
  versionNumber,
  thumbnailUrl,
}: NoteInputProps) {
  const [content, setContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const getStatusColor = () => {
    if (selected) return 'bg-blue-500'; // Blue for selected
    if (isDirty) return 'bg-red-500'; // Red for unsaved changes
    switch (status) {
      case 'draft':
        return 'bg-orange-500'; // Orange for draft saved but not published
      case 'published':
        return 'bg-green-500'; // Green for published
      default:
        return 'bg-transparent'; // Clear for no note entered
    }
  };

  const handleClear = () => {
    setContent('');
    setIsDirty(false);
    onClear();
  };

  const handleSave = () => {
    if (content.trim()) {
      setIsDirty(false);
      onSave();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsDirty(true);
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2">
        {thumbnailUrl && (
          <img 
            src={thumbnailUrl} 
            alt={`Thumbnail for ${versionName}`}
            className="w-12 h-12 object-cover rounded"
          />
        )}
        <div className="flex-1 truncate">
          <span className="font-medium">{versionName}</span>
          <span className="ml-2 text-gray-500">v{versionNumber}</span>
        </div>
      </div>
      <div className="flex gap-4 items-start">
        <div className="flex-1">
          <Textarea 
            placeholder="Enter notes for given version here"
            className="min-h-[100px] resize-none"
            value={content}
            onChange={handleChange}
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleClear}
            >
              Clear
            </Button>
            <Button 
              size="sm"
              onClick={handleSave}
              disabled={!content.trim()}
            >
              Save As Draft
            </Button>
          </div>
        </div>
        <div
          className={cn(
            'w-6 h-full min-h-[100px] rounded cursor-pointer transition-colors',
            getStatusColor(),
            'border border-gray-200'
          )}
          onClick={onSelectToggle}
          title={selected ? 'Selected' : status === 'empty' ? 'No note' : status === 'added' ? 'Note added' : status === 'draft' ? 'Draft saved' : 'Published'}
        />
      </div>
    </div>
  );
}
