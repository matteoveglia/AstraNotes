/**
 * @fileoverview NoteLabelPill.tsx
 * Reusable component for displaying note labels as colored pill badges.
 * Supports different sizes and optional click handlers for filtering.
 * @component
 */

import type React from "react";
import { cn } from "@/lib/utils";
import type { NoteLabel } from "@/types/relatedNotes";

interface NoteLabelPillProps {
	label: NoteLabel;
	size?: "sm" | "md";
	onClick?: (labelId: string) => void;
	className?: string;
}

export const NoteLabelPill: React.FC<NoteLabelPillProps> = ({
	label,
	size = "sm",
	onClick,
	className,
}) => {
	const handleClick = () => {
		if (onClick) {
			onClick(label.id);
		}
	};

	// Convert hex color to RGB for background with opacity
	const hexToRgb = (hex: string) => {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result
			? {
					r: parseInt(result[1], 16),
					g: parseInt(result[2], 16),
					b: parseInt(result[3], 16),
				}
			: { r: 156, g: 163, b: 175 }; // Default zinc-400 color
	};

	// Calculate if the color is light or dark for text contrast
	const isLightColor = (hex: string) => {
		const rgb = hexToRgb(hex);
		const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
		return brightness > 128;
	};

	const rgb = hexToRgb(label.color);
	const isLight = isLightColor(label.color);
	const textColor = isLight ? "#111827" : label.color;

	const sizeClasses = {
		sm: "text-xs px-2 py-0.5",
		md: "text-sm px-3 py-1",
	};

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full font-medium transition-colors",
				sizeClasses[size],
				onClick && "cursor-pointer hover:opacity-80",
				className,
			)}
			style={{
				backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isLight ? 0.22 : 0.14})`,
				color: textColor,
				borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isLight ? 0.45 : 0.6})`,
				borderWidth: "1px",
				borderStyle: "solid",
			}}
			onClick={onClick ? handleClick : undefined}
			title={onClick ? `Filter by ${label.name}` : label.name}
		>
			{label.name}
		</span>
	);
};
