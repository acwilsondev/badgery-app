import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from "@/lib/utils";

// Branded button with gradient effect
export const brandButtonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "bg-brand-purple hover:bg-brand-purple/90 text-white shadow",
        outline:
          "border border-brand-purple bg-transparent hover:bg-brand-purple/10 text-brand-purple",
        gradient:
          "relative overflow-hidden text-white shadow-md hover:shadow-lg transition-all duration-300 before:absolute before:inset-0 before:bg-gradient-to-r before:from-brand-purple before:to-brand-lilac before:z-0 before:transition-opacity before:duration-300 hover:before:opacity-90",
        secondary:
          "bg-brand-coral hover:bg-brand-coral/90 text-brand-charcoal shadow",
        accent:
          "bg-brand-orange hover:bg-brand-orange/90 text-white shadow",
        ghost:
          "hover:bg-brand-lilac/20 text-brand-purple hover:text-brand-purple",
        link:
          "underline-offset-4 hover:underline text-brand-purple",
      },
      size: {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-11 px-8 rounded-md",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BrandButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "gradient" | "secondary" | "accent" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export const BrandButton = React.forwardRef<HTMLButtonElement, BrandButtonProps>(
  ({ className, variant, size, children, ...props }, ref) => {
    return (
      <button
        className={cn(brandButtonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {variant === 'gradient' ? (
          <span className="relative z-10 flex items-center justify-center">{children}</span>
        ) : (
          children
        )}
      </button>
    );
  }
);
BrandButton.displayName = "BrandButton";

// Branded heading with optional gradient text effect
export interface BrandHeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  gradient?: boolean;
  align?: "left" | "center" | "right";
}

export const BrandHeading = React.forwardRef<HTMLHeadingElement, BrandHeadingProps>(
  ({ className, level = 2, gradient = false, align = "left", children, ...props }, ref) => {
    const Component = `h${level}` as keyof JSX.IntrinsicElements;
    
    const sizeClasses = {
      1: "text-4xl sm:text-5xl font-extrabold tracking-tight",
      2: "text-3xl font-bold tracking-tight",
      3: "text-2xl font-bold",
      4: "text-xl font-semibold",
      5: "text-lg font-semibold",
      6: "text-base font-semibold",
    }[level];
    
    const alignClasses = {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    }[align];
    
    const gradientClass = gradient 
      ? "text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-brand-lilac"
      : "";
    
    return (
      <Component
        className={cn(sizeClasses, alignClasses, gradientClass, className)}
        ref={ref}
        {...props}
      >
        {children}
      </Component>
    );
  }
);
BrandHeading.displayName = "BrandHeading";

// Card with branded styling
export interface BrandCardProps extends React.HTMLAttributes<HTMLDivElement> {
  gradient?: boolean;
  bordered?: boolean;
}

export const BrandCard = React.forwardRef<HTMLDivElement, BrandCardProps>(
  ({ className, gradient = false, bordered = false, children, ...props }, ref) => {
    return (
      <div
        className={cn(
          "rounded-lg bg-white dark:bg-gray-800 shadow-md overflow-hidden",
          bordered && "border border-brand-lilac/30 dark:border-brand-lilac/20",
          gradient && "bg-gradient-to-br from-brand-gray to-white dark:from-gray-800 dark:to-gray-700",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    );
  }
);
BrandCard.displayName = "BrandCard";

// Badge with branded styling options
export interface BrandBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "purple" | "lilac" | "orange" | "coral";
  size?: "sm" | "md" | "lg";
}

export const BrandBadge = React.forwardRef<HTMLDivElement, BrandBadgeProps>(
  ({ className, variant = "purple", size = "md", children, ...props }, ref) => {
    
    const variantClasses = {
      purple: "bg-brand-purple/10 text-brand-purple dark:bg-brand-purple/20 dark:text-white border-brand-purple/20",
      lilac: "bg-brand-lilac/20 text-brand-purple dark:bg-brand-lilac/30 dark:text-white border-brand-lilac/30",
      orange: "bg-brand-orange/10 text-brand-orange dark:bg-brand-orange/20 dark:text-white border-brand-orange/20",
      coral: "bg-brand-coral/10 text-brand-charcoal dark:bg-brand-coral/20 dark:text-white border-brand-coral/20",
    }[variant];
    
    const sizeClasses = {
      sm: "text-xs px-2 py-0.5",
      md: "text-sm px-2.5 py-0.5",
      lg: "text-base px-3 py-1",
    }[size];
    
    return (
      <div
        className={cn(
          "inline-flex items-center rounded-full border font-medium",
          variantClasses,
          sizeClasses,
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    );
  }
);
BrandBadge.displayName = "BrandBadge";