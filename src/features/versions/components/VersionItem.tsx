/**
 * @fileoverview VersionItem.tsx
 * Component for displaying a single version with thumbnail and note input.
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { NoteInput } from '@/components/NoteInput';
import { AssetVersion, NoteStatus } from '@/types';
import { motion } from 'motion/react';
import { ThumbnailPreview } from '@/features/versions/components/ThumbnailPreview';

interface VersionItemProps {
  version: AssetVersion;
  isSelected: boolean;
  thumbnailUrl?: string;
  thumbnailLoading?: boolean;
  draftContent?: string;
  labelId?: string;
  noteStatus?: NoteStatus;
  onSelect: () => void;
  onNoteChange: (content: string, labelId: string) => void;
  onNoteClear: () => void;
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { 
    opacity: 0, 
    scale: 0.9, 
    y: -10,
    transition: { duration: 0.15 } 
  }
};

export const VersionItem: React.FC<VersionItemProps> = ({
  version,
  isSelected,
  thumbnailUrl,
  thumbnailLoading = false,
  draftContent = '',
  labelId = '',
  noteStatus = 'empty' as NoteStatus,
  onSelect,
  onNoteChange,
  onNoteClear
}) => {
  const handleNoteInputSave = (content: string, noteLabelId: string) => {
    onNoteChange(content, noteLabelId);
  };

  return (
    <motion.div
      className={`rounded-lg border ${isSelected ? 'border-primary' : 'border-border'} overflow-hidden`}
      variants={itemVariants}
      layout
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <Card className="h-full">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4">
          <div className="flex-none w-full md:w-48">
            <ThumbnailPreview
              url={thumbnailUrl}
              alt={`Thumbnail for ${version.name}`}
              isLoading={thumbnailLoading}
              onClick={onSelect}
            />
            <div className="mt-2 text-sm">
              <div className="font-medium truncate" title={version.name}>
                {version.name}
              </div>
              <div className="text-muted-foreground">
                Version {version.version}
              </div>
            </div>
          </div>
          
          <div className="flex-1">
            <NoteInput
              versionName={version.name}
              versionNumber={version.version.toString()}
              initialContent={draftContent}
              initialLabelId={labelId}
              status={noteStatus}
              onSave={handleNoteInputSave}
              onClear={onNoteClear}
              onSelectToggle={onSelect}
              selected={isSelected}
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
