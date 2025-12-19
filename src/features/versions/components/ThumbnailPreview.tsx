/**
 * @fileoverview ThumbnailPreview.tsx
 * Component for displaying version thumbnails with loading states.
 */

import type React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageIcon } from "lucide-react";

interface ThumbnailPreviewProps {
	url?: string;
	alt: string;
	isLoading?: boolean;
	onClick?: () => void;
}

export const ThumbnailPreview: React.FC<ThumbnailPreviewProps> = ({
	url,
	alt,
	isLoading = false,
	onClick,
}) => {
	if (isLoading) {
		return (
			<div className="w-full aspect-video bg-muted rounded-md overflow-hidden">
				<Skeleton className="w-full h-full" />
			</div>
		);
	}

	return (
		<div
			className="w-full aspect-video bg-muted rounded-md overflow-hidden cursor-pointer"
			onClick={onClick}
		>
			{url ? (
				<img src={url} alt={alt} className="w-full h-full object-cover" />
			) : (
				<div className="w-full h-full flex items-center justify-center">
					<ImageIcon className="w-12 h-12 text-muted-foreground opacity-50" />
				</div>
			)}
		</div>
	);
};
