import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-theme-md",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground",
          success: "group-[.toaster]:!bg-[#F0FDF4] group-[.toaster]:!border-[#BBF7D0] group-[.toaster]:!text-[#15803D] dark:group-[.toaster]:!bg-emerald-950/60 dark:group-[.toaster]:!text-emerald-200 dark:group-[.toaster]:!border-emerald-800",
          error: "group-[.toaster]:!bg-[#FEF2F2] group-[.toaster]:!border-[#FECACA] group-[.toaster]:!text-[#B91C1C] dark:group-[.toaster]:!bg-red-950/60 dark:group-[.toaster]:!text-red-200 dark:group-[.toaster]:!border-red-800",
          warning: "group-[.toaster]:!bg-[#FFFBEB] group-[.toaster]:!border-[#FDE68A] group-[.toaster]:!text-[#B45309] dark:group-[.toaster]:!bg-amber-950/60 dark:group-[.toaster]:!text-amber-200 dark:group-[.toaster]:!border-amber-800",
          info: "group-[.toaster]:!bg-[#EFF6FF] group-[.toaster]:!border-[#BFDBFE] group-[.toaster]:!text-[#1D4ED8] dark:group-[.toaster]:!bg-blue-950/60 dark:group-[.toaster]:!text-blue-200 dark:group-[.toaster]:!border-blue-800",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
