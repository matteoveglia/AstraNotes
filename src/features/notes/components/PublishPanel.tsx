/**
 * @fileoverview PublishPanel.tsx
 * Component for displaying publishing controls for notes.
 */

import type React from "react";
import { Button } from "@/components/ui/button";
import { GlowEffect } from "@/components/ui/glow-effect";

interface PublishPanelProps {
	selectedCount: number;
	onPublishSelected: () => void;
	onPublishAll: () => void;
	disablePublishAll: boolean;
	isPublishing: boolean;
}

export const PublishPanel: React.FC<PublishPanelProps> = ({
	selectedCount,
	onPublishSelected,
	onPublishAll,
	disablePublishAll,
	isPublishing,
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
				{!disablePublishAll && !isPublishing && (
					<GlowEffect
						colors={["#FF5733", "#33FF57", "#3357FF", "#F1C40F"]}
						mode="pulse"
						blur="soft"
						duration={3}
						scale={1.1}
					/>
				)}
				<Button
					size="sm"
					onClick={onPublishAll}
					disabled={disablePublishAll || isPublishing}
					className="relative z-10"
				>
					Publish All Notes
				</Button>
			</div>
		</div>
	);
};
