import React from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface VersionSearchProps {
  onClearAdded: () => void;
  onClearAll: () => void;
}

export const VersionSearch: React.FC<VersionSearchProps> = ({
  onClearAdded,
  onClearAll,
}) => (
  <div className="flex gap-2">
    <Input
      type="text"
      placeholder="Search for a version to add here"
      className="flex-1"
    />
    <Button variant="outline" size="sm" onClick={onClearAdded}>
      Clear Added Versions
    </Button>
    <Button variant="outline" size="sm" onClick={onClearAll}>
      Clear All Versions
    </Button>
  </div>
);
