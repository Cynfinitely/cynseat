import type { ComponentProps } from "react";
import { timeZoneOptions } from "@/lib/time-zones";
import { Select } from "./ui/field";

export function TimeZoneSelect(props: ComponentProps<"select">) {
  const { common, all } = timeZoneOptions();
  return (
    <Select {...props}>
      {common.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replace(/_/g, " ")}
        </option>
      ))}
      <option disabled>──────────</option>
      {all.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replace(/_/g, " ")}
        </option>
      ))}
    </Select>
  );
}
