import { cn } from "@/lib/utils";

const FONT_SIZES = [
  { value: 12, twClass: "text-xs",   hint: "12" },
  { value: 13, twClass: "text-sm",   hint: "13" },
  { value: 14, twClass: "text-base", hint: "14" },
  { value: 16, twClass: "text-lg",   hint: "16" },
] as const;

interface SettingsPanelProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
}

export function SettingsPanel({ fontSize, onFontSizeChange }: SettingsPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium text-foreground">Font size</span>
      <div className="flex items-end gap-2">
        {FONT_SIZES.map(({ value, twClass, hint }) => (
          <button
            key={value}
            onClick={() => onFontSizeChange(value)}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-2 rounded-md transition-colors flex-1",
              fontSize === value
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <span className={cn("font-sans leading-none", twClass)}>A</span>
            <span className="text-[10px] text-muted-foreground font-mono">{hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
