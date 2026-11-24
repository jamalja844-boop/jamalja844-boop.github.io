import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-navy-900 text-white shadow-sm hover:bg-navy-800 dark:bg-brand-sky dark:text-navy-950 dark:hover:bg-turq-300 active:scale-[0.98]",
        accent:
          "bg-gradient-to-r from-brand-sky to-turq-400 text-navy-950 shadow-[0_6px_20px_-6px_rgba(45,212,191,0.55)] hover:brightness-105 active:scale-[0.98]",
        secondary: "bg-muted text-foreground hover:bg-accent border border-border",
        outline: "border border-border bg-transparent hover:bg-muted",
        ghost: "hover:bg-muted text-foreground",
        danger: "bg-danger/10 text-danger hover:bg-danger/20 border border-danger/30",
        link: "text-brand-sky-strong dark:text-brand-sky underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-lg",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "size-9 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
        {asChild ? children : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
