/**
 * @fileoverview CreatePlaylistDialog.tsx
 * Dialog component for creating new playlists.
 * Features:
 * - Form validation for playlist creation
 * - Radio buttons for Review Session/List selection
 * - Category dropdown for List type
 * - Version preview for pre-selected versions
 * - Loading states and error handling
 */

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { usePlaylistCreationStore } from "@/store/playlistCreationStore";
import { CreatePlaylistRequest, Playlist, AssetVersion } from "@/types";
import { Loader2, AlertCircle } from "lucide-react";

interface CreatePlaylistDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (playlist: Playlist) => void;
  preSelectedVersions?: AssetVersion[];
  projectId?: string;
}

interface FormData {
  name: string;
  type: "reviewsession" | "list";
  categoryId: string;
  description: string;
}

interface FormErrors {
  name?: string;
  categoryId?: string;
}

export function CreatePlaylistDialog({
  isOpen,
  onClose,
  onSuccess,
  preSelectedVersions = [],
  projectId = "", // TODO: Get from app context
}: CreatePlaylistDialogProps) {
  console.log("CreatePlaylistDialog render:", {
    isOpen,
    preSelectedVersionsCount: preSelectedVersions.length,
    projectId,
    versions: preSelectedVersions.map((v) => ({ id: v.id, name: v.name })),
  });
  const {
    isCreating,
    createError,
    categories,
    categoriesLoading,
    createPlaylist,
    fetchCategories,
    clearErrors,
  } = usePlaylistCreationStore();

  const [formData, setFormData] = useState<FormData>({
    name: "",
    type: "reviewsession",
    categoryId: "",
    description: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});

  // Fetch categories when dialog opens and type is list
  useEffect(() => {
    if (isOpen && formData.type === "list" && projectId) {
      fetchCategories(projectId);
    }
  }, [isOpen, formData.type, projectId, fetchCategories]);

  // Clear errors when dialog opens
  useEffect(() => {
    if (isOpen) {
      clearErrors();
      setErrors({});
    }
  }, [isOpen, clearErrors]);

  // Update category selection when type changes
  useEffect(() => {
    if (formData.type === "reviewsession") {
      setFormData((prev) => ({ ...prev, categoryId: "" }));
      setErrors((prev) => ({ ...prev, categoryId: undefined }));
    }
  }, [formData.type]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Playlist name is required";
    }

    if (formData.type === "list" && !formData.categoryId) {
      newErrors.categoryId = "Category is required for lists";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const request: CreatePlaylistRequest = {
        name: formData.name.trim(),
        type: formData.type,
        projectId,
        description: formData.description.trim() || undefined,
        categoryId: formData.type === "list" ? formData.categoryId : undefined,
        categoryName:
          formData.type === "list"
            ? categories.find((c) => c.id === formData.categoryId)?.name
            : undefined,
      };

      console.log("CreatePlaylistDialog: Creating playlist with versions:", {
        request,
        versionsCount: preSelectedVersions.length,
        versions: preSelectedVersions.map((v) => ({ id: v.id, name: v.name })),
      });
      const playlist = await createPlaylist(request, preSelectedVersions);
      console.log("CreatePlaylistDialog: Playlist created:", {
        playlistId: playlist.id,
        versionsCount: playlist.versions?.length || 0,
        versions: playlist.versions?.map((v) => ({ id: v.id, name: v.name })),
      });

      // Reset form
      setFormData({
        name: "",
        type: "reviewsession",
        categoryId: "",
        description: "",
      });

      onSuccess(playlist);
      onClose();
    } catch (error) {
      // Error handling is managed by the store
      console.error("Failed to create playlist:", error);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      type: "reviewsession",
      categoryId: "",
      description: "",
    });
    setErrors({});
    clearErrors();
    onClose();
  };

  const selectedCategory = categories.find((c) => c.id === formData.categoryId);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Playlist</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Playlist Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Name *
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Enter playlist name"
              className={errors.name ? "border-red-500" : ""}
            />
            {errors.name && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.name}
              </p>
            )}
          </div>

          {/* Playlist Type */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Type *</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="reviewsession"
                  checked={formData.type === "reviewsession"}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setFormData((prev) => ({
                        ...prev,
                        type: "reviewsession",
                      }));
                    }
                  }}
                />
                <Label htmlFor="reviewsession" className="text-sm">
                  Review Session
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="list"
                  checked={formData.type === "list"}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setFormData((prev) => ({ ...prev, type: "list" }));
                    }
                  }}
                />
                <Label htmlFor="list" className="text-sm">
                  List
                </Label>
              </div>
            </div>
          </div>

          {/* Category Selection (List only) */}
          {formData.type === "list" && (
            <div className="space-y-2">
              <Label htmlFor="category" className="text-sm font-medium">
                Category *
              </Label>
              <Select
                value={formData.categoryId}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, categoryId: value }))
                }
                disabled={categoriesLoading}
              >
                <SelectTrigger
                  className={errors.categoryId ? "border-red-500" : ""}
                >
                  <SelectValue
                    placeholder={
                      categoriesLoading
                        ? "Loading categories..."
                        : "Select a category"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoryId && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.categoryId}
                </p>
              )}
            </div>
          )}

          {/* Description (Review Session only) */}
          {formData.type === "reviewsession" && (
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                Description
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Optional description"
                rows={3}
                spellCheck={false}
              />
            </div>
          )}

          {/* Version Preview */}
          {preSelectedVersions.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Versions to include ({preSelectedVersions.length})
              </Label>
              <div className="max-h-24 overflow-y-auto border rounded-md p-2 space-y-1 bg-muted/30">
                {preSelectedVersions.map((version) => (
                  <div
                    key={version.id}
                    className="text-xs text-muted-foreground"
                  >
                    {version.name} v{version.version}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Display */}
          {createError && (
            <div className="p-3 border border-red-200 rounded-md bg-red-50 dark:bg-red-900/20">
              <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {createError}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Playlist
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
