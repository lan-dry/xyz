import Image from "next/image";

type SalanorLogoProps = {
  className?: string;
  showWordmark?: boolean;
  markClassName?: string;
  size?: number;
  /** Dark site chrome uses the white mark; light surfaces use primary teal. */
  variant?: "primary" | "white";
};

export function SalanorLogo({
  className = "",
  showWordmark = true,
  markClassName,
  size = 32,
  variant = "white",
}: SalanorLogoProps) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.625rem" }}
    >
      <SalanorMark className={markClassName} size={size} variant={variant} />
      {showWordmark ? <span className="logo-wordmark">Salanor</span> : null}
    </span>
  );
}

/** Company mark from Salanor-Brand-Assets-Final (primary #0D3535 or white). */
export function SalanorMark({
  className,
  size = 32,
  variant = "white",
}: {
  className?: string;
  size?: number;
  variant?: "primary" | "white";
}) {
  const src =
    variant === "primary" ? "/salanor-mark-primary.png" : "/salanor-mark-white.png";

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
      priority
    />
  );
}
