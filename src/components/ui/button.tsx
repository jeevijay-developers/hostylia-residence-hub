import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-tone-glow hover:bg-primary/90 hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_30%,transparent),0_10px_28px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)]",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        /* Marketing-site CTAs (landing redesign) */
        brand:
          "bg-linear-to-b from-brand-green to-brand-green-strong font-semibold text-brand-green-foreground shadow-brand-cta transition-[filter,box-shadow,transform] hover:brightness-110 active:translate-y-px",
        "brand-soft":
          "border border-brand-green/15 bg-brand-green-soft font-semibold text-brand-green hover:bg-brand-green/15",
        /* On an emerald surface (CtaBanner): solid and outlined. */
        "on-brand":
          "bg-card font-semibold text-brand-green shadow-lg shadow-brand-green-strong/30 hover:bg-card/90 focus-visible:ring-2 focus-visible:ring-brand-green-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-brand-green",
        "on-brand-outline":
          "border border-brand-green-foreground/70 bg-transparent font-semibold text-brand-green-foreground hover:bg-brand-green-foreground/10 focus-visible:ring-2 focus-visible:ring-brand-green-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-brand-green",
        glass:
          "border border-border/80 bg-card/75 font-semibold text-foreground shadow-card-ambient backdrop-blur-md hover:bg-card",
      },
      size: {
        default: "h-10 rounded-lg px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10 rounded-lg",
        pill: "h-10 rounded-full px-5",
        "pill-lg": "h-12 rounded-full px-7 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
