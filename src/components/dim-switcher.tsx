"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const DIMS = [
  { value: "campaign", label: "Campaigns" },
  { value: "creative", label: "Creatives" },
  { value: "landing_page", label: "Landing pages" },
  { value: "platform", label: "Platforms" },
  { value: "ad_set", label: "Ad sets" },
] as const;

export function DimSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("dim") ?? "campaign";

  return (
    <div className="inline-flex rounded-lg border bg-card p-0.5">
      {DIMS.map((d) => (
        <button
          key={d.value}
          type="button"
          onClick={() => {
            const params = new URLSearchParams(searchParams);
            if (d.value === "campaign") params.delete("dim");
            else params.set("dim", d.value);
            router.push(`${pathname}?${params.toString()}`);
          }}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            current === d.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
