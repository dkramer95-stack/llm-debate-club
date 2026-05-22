"use client";

import { MODELS } from "@/lib/models";

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  accent?: "pro" | "con" | "judge";
  disabled?: boolean;
};

const ACCENTS: Record<NonNullable<Props["accent"]>, string> = {
  pro: "border-pro/40 focus-within:border-pro",
  con: "border-con/40 focus-within:border-con",
  judge: "border-judge/40 focus-within:border-judge",
};

export default function ModelPicker({ label, value, onChange, accent = "pro", disabled }: Props) {
  return (
    <label
      className={`flex flex-col gap-1.5 rounded-lg border bg-bg-elev px-3 py-2 transition ${ACCENTS[accent]} ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-transparent text-sm text-slate-100 outline-none"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id} className="bg-bg-card text-slate-100">
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
