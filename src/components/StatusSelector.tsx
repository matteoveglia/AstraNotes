/**
 * @fileoverview StatusSelector.tsx
 * Dropdown component for selecting and updating a version's status.
 * @component
 */

import type React from "react";
import type { VersionStatus } from "@/services/relatedVersionsService";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StatusSelectorProps {
	versionId: string;
	currentStatus: VersionStatus | null;
	availableStatuses: VersionStatus[];
	onStatusUpdate?: (versionId: string, newStatusId: string) => void;
	className?: string;
}

export const StatusSelector: React.FC<StatusSelectorProps> = ({
	versionId,
	currentStatus,
	availableStatuses,
	onStatusUpdate,
	className,
}) => {
	const handleSelect = (statusId: string) => {
		onStatusUpdate?.(versionId, statusId);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						"h-auto px-2 py-1 text-xs justify-start font-medium",
						className,
					)}
				>
					<div className="flex items-center gap-2 flex-wrap">
						{currentStatus?.color && (
							<div
								className="w-2 h-2 rounded-full"
								style={{ backgroundColor: currentStatus.color }}
							/>
						)}
						<span>{currentStatus?.name || "Unknown"}</span>
					</div>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				{availableStatuses.map((status) => (
					<DropdownMenuItem
						key={status.id}
						disabled={status.id === currentStatus?.id}
						onSelect={() => handleSelect(status.id)}
					>
						<div className="flex items-center gap-2">
							{status.color && (
								<div
									className="w-2 h-2 rounded-full"
									style={{ backgroundColor: status.color }}
								/>
							)}
							<span>{status.name}</span>
						</div>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
