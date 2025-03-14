/**
 * @fileoverview PublishingControls.tsx
 * Component for managing note publishing operations including publishing selected notes,
 * publishing all notes, and accessing additional note management options.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { PlaylistMenu } from "@/components/PlaylistMenu";
import { GlowEffect } from '@/components/ui/glow-effect';

interface PublishingControlsProps {
  selectedCount: number;
  draftCount: number;
  isPublishing: boolean;
  onPublishSelected: () => void;
  onPublishAll: () => void;
  onClearAllNotes: () => void;
  onSetAllLabels: (labelId: string) => void;
}

export const PublishingControls: React.FC<PublishingControlsProps> = ({
  selectedCount,
  draftCount,
  isPublishing,
  onPublishSelected,
  onPublishAll,
  onClearAllNotes,
  onSetAllLabels,
}) => {
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={onPublishSelected}
        disabled={selectedCount === 0 || isPublishing}
      >
        Publish {selectedCount} Selected
      </Button>
      <div className="relative inline-block">
        {draftCount > 0 && !isPublishing && (
          <GlowEffect
            colors={['#FF5733', '#33FF57', '#3357FF', '#F1C40F']}
            mode='pulse'
            blur='soft'
            duration={3}
            scale={1.1}
          />
        )}
        <Button
          size="sm"
          onClick={onPublishAll}
          disabled={draftCount === 0 || isPublishing}
          className="relative z-10"
        >
          Publish All Notes
        </Button>
      </div>
      <div className="ml-3 mx-1 w-px bg-foreground/20 self-stretch" />
      <PlaylistMenu
        onClearAllNotes={onClearAllNotes}
        onSetAllLabels={onSetAllLabels}
      />
    </div>
  );
};
