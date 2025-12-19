/**
 * @fileoverview SyncConflictDialog.tsx
 * Dialog component for resolving playlist name conflicts during ftrack sync.
 * Presents users with options to either cancel sync or rename the local playlist.
 */

import React, { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";

export interface SyncConflictDetails {
	playlistId: string;
	playlistName: string;
	playlistType: "reviewsession" | "list";
	projectId: string;
	errorMessage: string;
}

interface SyncConflictDialogProps {
	isOpen: boolean;
	conflictDetails: SyncConflictDetails | null;
	onCancel: () => void;
	onRename: (newName: string) => void;
	isProcessing?: boolean;
}

export function SyncConflictDialog({
	isOpen,
	conflictDetails,
	onCancel,
	onRename,
	isProcessing = false,
}: SyncConflictDialogProps) {
	const [newName, setNewName] = useState("");
	const [nameError, setNameError] = useState<string | null>(null);

	React.useEffect(() => {
		if (isOpen && conflictDetails) {
			// Initialize with the original name
			setNewName(conflictDetails.playlistName);
			setNameError(null);
		}
	}, [isOpen, conflictDetails]);

	const validateNewName = () => {
		if (!newName.trim()) {
			setNameError("Playlist name is required");
			return false;
		}

		if (conflictDetails && newName.trim() === conflictDetails.playlistName) {
			setNameError("New name must be different from the current name");
			return false;
		}

		setNameError(null);
		return true;
	};

	const handleRename = () => {
		if (validateNewName()) {
			onRename(newName.trim());
		}
	};

	const handleCancel = () => {
		setNewName("");
		setNameError(null);
		onCancel();
	};

	if (!conflictDetails) return null;

	return (
		<Dialog open={isOpen} onOpenChange={handleCancel}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertCircle className="h-5 w-5 text-orange-500" />
						Playlist Name Conflict
					</DialogTitle>
					<DialogDescription>
						A playlist with this name already exists in ftrack. Choose how to
						resolve this conflict.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Conflict Explanation */}
					<div className="p-3 border border-orange-200 rounded-md bg-orange-50 dark:bg-orange-900/20">
						<p className="text-sm text-orange-700 dark:text-orange-300">
							A playlist named <strong>"{conflictDetails.playlistName}"</strong>{" "}
							already exists in ftrack. You can either cancel the sync to handle
							this in ftrack, or rename your local playlist and try again.
						</p>
					</div>

					{/* Playlist Details */}
					<div className="space-y-2 text-sm text-muted-foreground">
						<div>
							<strong>Type:</strong>{" "}
							{conflictDetails.playlistType === "reviewsession"
								? "Review Session"
								: "List"}
						</div>
						<div>
							<strong>Original Name:</strong> {conflictDetails.playlistName}
						</div>
					</div>

					{/* Rename Option */}
					<div className="space-y-2">
						<Label htmlFor="newName" className="text-sm font-medium">
							New Playlist Name
						</Label>
						<Input
							id="newName"
							value={newName}
							onChange={(e) => {
								setNewName(e.target.value);
								setNameError(null);
							}}
							onBlur={validateNewName}
							placeholder="Enter new name for your playlist"
							className={nameError ? "border-red-500" : ""}
							disabled={isProcessing}
						/>
						{nameError && (
							<p className="text-sm text-red-500 flex items-center gap-1">
								<AlertCircle className="h-3 w-3" />
								{nameError}
							</p>
						)}
					</div>

					{/* Actions Explanation */}
					<div className="text-xs text-muted-foreground space-y-1">
						<p>
							<strong>Cancel Sync:</strong> Stop the sync process. You can
							resolve the conflict in ftrack and try again later.
						</p>
						<p>
							<strong>Rename & Retry:</strong> Rename your local playlist and
							automatically retry the sync with the new name.
						</p>
					</div>
				</div>

				<DialogFooter className="gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={handleCancel}
						disabled={isProcessing}
					>
						Cancel Sync
					</Button>
					<Button
						onClick={handleRename}
						disabled={isProcessing || !newName.trim() || !!nameError}
					>
						{isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						Rename & Retry
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
