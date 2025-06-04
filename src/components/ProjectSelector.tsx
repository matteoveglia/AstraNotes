/**
 * @fileoverview ProjectSelector.tsx
 * Project selection dropdown with glow effect when no project selected.
 * Provides filtering functionality for playlists and lists by project.
 * @component
 */

import React, { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useProjectStore } from "../store/projectStore";
import { GlowEffect } from "./ui/glow-effect";
import { Folder, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ProjectSelectorProps {
  /** Callback when project selection changes */
  onProjectChange?: (projectId: string | null) => void;
  /** Additional CSS classes */
  className?: string;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({ 
  onProjectChange,
  className
}) => {
  const { 
    projects, 
    selectedProjectId, 
    isLoading, 
    error,
    hasValidatedSelectedProject,
    setSelectedProject, 
    loadProjects,
    validateSelectedProject
  } = useProjectStore();

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Validate selected project when projects load
  useEffect(() => {
    if (projects.length > 0 && selectedProjectId && !hasValidatedSelectedProject) {
      validateSelectedProject();
    }
  }, [projects, selectedProjectId, hasValidatedSelectedProject, validateSelectedProject]);

  const handleValueChange = (value: string) => {
    const projectId = value === "none" ? null : value;
    setSelectedProject(projectId);
    onProjectChange?.(projectId);
  };

  const handleClear = () => {
    console.log("ProjectSelector: handleClear called");
    setSelectedProject(null);
    onProjectChange?.(null);
  };

  const shouldShowGlow = !selectedProjectId && !isLoading && projects.length > 0;

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-2 min-w-[200px] relative", className)}>    
        <div className="relative flex-1">
          {shouldShowGlow && (
            <GlowEffect
              colors={["#3B82F6", "#8B5CF6", "#EF4444", "#10B981"]}
              mode="pulse"
              blur="soft"
              duration={2.5}
              scale={1.05}
            />
          )}
          
          <Select
            value={selectedProjectId || "none"}
            onValueChange={handleValueChange}
            disabled={isLoading}
          >
            <SelectTrigger className={cn(
              "w-full relative z-10 h-7 bg-white dark:bg-zinc-900",
              selectedProjectId && "pr-8", // Add padding when X button is shown
              shouldShowGlow && "ring-2 ring-blue-200 dark:ring-blue-800"
            )}>
              <SelectValue 
                placeholder={isLoading ? "Loading projects..." : "Select project..."} 
              />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-zinc-900">
              <SelectItem value="none" disabled>
                {isLoading ? "Loading projects..." : "Select a project"}
              </SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {selectedProjectId && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClear();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 rounded-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center z-20"
              title="Clear selection"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {error && (
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
            </TooltipTrigger>
            <TooltipContent>
              <p>{error}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}; 