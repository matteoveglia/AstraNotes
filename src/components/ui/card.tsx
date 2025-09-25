import * as React from "react";
import { cn } from "@/lib/utils";

type CardProps = React.ComponentPropsWithRef<"div">;

const Card = ({ className, ...props }: CardProps) => (
  <div
    className={cn(
      "rounded-xl bg-card text-card-foreground shadow-sm",
      className,
    )}
    {...props}
  />
);
Card.displayName = "Card";

type CardHeaderProps = React.ComponentPropsWithRef<"div">;

const CardHeader = ({ className, ...props }: CardHeaderProps) => (
  <div className={cn("flex flex-col px-5 py-4", className)} {...props} />
);
CardHeader.displayName = "CardHeader";

type CardTitleProps = React.ComponentPropsWithRef<"h3">;

const CardTitle = ({ className, ...props }: CardTitleProps) => (
  <h3
    className={cn(
      "font-semibold leading-none tracking-tight select-none",
      className,
    )}
    {...props}
  />
);
CardTitle.displayName = "CardTitle";

type CardDescriptionProps = React.ComponentPropsWithRef<"p">;

const CardDescription = ({ className, ...props }: CardDescriptionProps) => (
  <p
    className={cn("text-sm text-muted-foreground select-none", className)}
    {...props}
  />
);
CardDescription.displayName = "CardDescription";

type CardContentProps = React.ComponentPropsWithRef<"div">;

const CardContent = ({ className, ...props }: CardContentProps) => (
  <div className={cn("px-4", className)} {...props} />
);
CardContent.displayName = "CardContent";

type CardFooterProps = React.ComponentPropsWithRef<"div">;

const CardFooter = ({ className, ...props }: CardFooterProps) => (
  <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
);
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
