import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { RiLoader3Line } from "react-icons/ri";

import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary  underline-offset-4 hover:underline",
        disabled: "text-gray-500 bg-gray-400 pointed-none",
        minimal: "py-0 px-0   md:py-0 md:p-0  max-h-fit",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  disabled?: boolean;
  hideChild?: boolean;
  icon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      icon,
      size,
      disabled = false,
      loading = false,
      asChild = false,
      hideChild = false,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        {...props}
        disabled={disabled || loading}
        className={`${cn(
          "ease-in-out duration-75 active:scale-95",
          buttonVariants({ variant, size, className }),
          "transition-transform will-change-transform cursor-pointer"
        )} `}
      >
        <RiLoader3Line
          className={`${loading ? "size-6 animate-spin  " : "hidden"} ${
            !hideChild && "mr-2"
          } transition-transform  `}
        />
        <span
          className={cn(
            (!icon || (hideChild && loading)) && "hidden",
            props.children && "mr-2"
          )}
        >
          {icon}
        </span>
        <>{hideChild ? !loading && props.children : props.children}</>
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
