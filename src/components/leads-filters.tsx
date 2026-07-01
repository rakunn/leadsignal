"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SEGMENT_LABELS } from "@/components/segment-badge";

const ALL = "all";

const FLAG_LABELS: Record<string, string> = {
  invalid_email: "Invalid email",
  disposable_email: "Disposable email",
  invalid_phone: "Invalid phone",
  duplicate: "Duplicate",
  burst_submission: "Burst submission",
  no_engagement: "No engagement",
  low_value_source: "Low-value source",
  high_cost_low_quality: "High cost, low quality",
};

function FilterSelect({
  param,
  placeholder,
  options,
  width = "w-44",
}: {
  param: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  width?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param) ?? ALL;

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === ALL) params.delete(param);
    else params.set(param, value);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className={width} size="sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LeadsFilters({ campaigns }: { campaigns: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect
        param="segment"
        placeholder="All segments"
        options={Object.entries(SEGMENT_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
      />
      <FilterSelect
        param="campaign"
        placeholder="All campaigns"
        options={campaigns.map((c) => ({ value: c, label: c }))}
        width="w-56"
      />
      <FilterSelect
        param="flag"
        placeholder="All risk flags"
        options={Object.entries(FLAG_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
      />
      <FilterSelect
        param="sort"
        placeholder="Lowest signal first"
        options={[
          { value: "score_desc", label: "Highest signal first" },
          { value: "created_desc", label: "Newest first" },
          { value: "cost_desc", label: "Most expensive first" },
        ]}
      />
    </div>
  );
}
