import React, { useState, useEffect } from 'react';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { NoteStatus } from '../types';
import { cn } from '../lib/utils';

export interface NoteInputProps {
  versionName: string;
  versionNumber: string;
  thumbnailUrl?: string;
  status: NoteStatus;
  selected: boolean;
  initialContent?: string;
  onSave: (content: string) => void;
  onClear: () => void;
  onSelectToggle: () => void;
}

export const NoteInput: React.FC<NoteInputProps> = ({
  versionName,
  versionNumber,
  thumbnailUrl,
  status,
  selected,
  initialContent = '',
  onSave,
  onClear,
  onSelectToggle,
}) => {
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    onSave(newContent);
  };

  const handleClear = () => {
    setContent('');
    onClear();
  };

  const getStatusColor = () => {
    if (selected) return 'bg-blue-500 hover:bg-blue-600'; // Blue for selected
    switch (status) {
      case 'draft':
        return 'bg-yellow-500 hover:bg-yellow-600'; // Yellow for draft
      case 'published':
        return 'bg-green-500 hover:bg-green-600'; // Green for published
      default:
        return 'bg-gray-200'; // Gray for empty
    }
  };

  const getStatusTitle = () => {
    if (selected) return 'Selected';
    switch (status) {
      case 'draft':
        return 'Draft saved';
      case 'published':
        return 'Published';
      default:
        return 'No note';
    }
  };

  return (
    <div className="flex gap-4 p-4 bg-white rounded-lg border">
      <div className="flex-shrink-0 w-32 h-18 bg-gray-100 rounded overflow-hidden">
        {thumbnailUrl ? (
          <img 
            src={thumbnailUrl} 
            alt={versionName} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            No Preview
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <h3 className="font-medium text-gray-900 truncate">
                {versionName}
              </h3>
              <span className="text-base text-gray-500">
                - v{versionNumber}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-3">
          <div className="flex-1">
            <Textarea
              value={content}
              onChange={handleChange}
              placeholder="Add a note..."
              className="min-h-[80px]"
            />
            {status !== 'empty' && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleClear}
                className="text-gray-500 hover:text-gray-700 mt-2"
              >
                Clear
              </Button>
            )}
          </div>
          
          <div
            onClick={status === 'empty' ? undefined : onSelectToggle}
            className={cn(
              'w-5 rounded-full transition-colors',
              status === 'empty' ? 'cursor-default' : 'cursor-pointer',
              getStatusColor()
            )}
            title={getStatusTitle()}
          />
        </div>
      </div>
    </div>
  );
};
