import Link from "next/link";
import { BrandGlyph } from "@/components/signal-bars";
import { cn } from "@/lib/utils";

export function Wordmark({
  className,
  asLink = true,
}: {
  className?: string;
  asLink?: boolean;
}) {
  const inner = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandGlyph />
      <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
        LeadSignal
      </span>
    </span>
  );
  if (!asLink) return inner;
  return (
    <Link href="/datasets" className="transition-opacity hover:opacity-80">
      {inner}
    </Link>
  );
}
