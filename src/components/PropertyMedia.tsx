import { Building2, Home, Trees, Tractor } from "lucide-react";

const config: Record<
  string,
  { icon: typeof Home; gradient: string }
> = {
  Apartamento: { icon: Building2, gradient: "from-primary/85 to-teal/80" },
  Casa: { icon: Home, gradient: "from-teal/80 to-primary/85" },
  Lote: { icon: Trees, gradient: "from-emerald-700/80 to-primary/85" },
  Campo: { icon: Tractor, gradient: "from-amber-700/70 to-primary/85" },
};

export function PropertyMedia({
  tipo,
  className = "",
  iconSize = 56,
}: {
  tipo: string;
  className?: string;
  iconSize?: number;
}) {
  const { icon: Icon, gradient } = config[tipo] ?? config.Casa;
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br ${gradient} ${className}`}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, white 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <Icon
        size={iconSize}
        strokeWidth={1.25}
        className="relative text-primary-foreground/90"
      />
    </div>
  );
}
