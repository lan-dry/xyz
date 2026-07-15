import Image from "next/image";
import type { SVGProps } from "react";

type SalanorLogoProps = {
  className?: string;
  showWordmark?: boolean;
  markClassName?: string;
  size?: number;
};

export function SalanorLogo({
  className = "",
  showWordmark = true,
  markClassName,
  size = 32,
}: SalanorLogoProps) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.625rem" }}
    >
      <SalanorMark className={markClassName} size={size} />
      {showWordmark ? <span className="logo-wordmark">Salanor</span> : null}
    </span>
  );
}

/** Company mark — gradient S (public/salanor-logo.png). */
export function SalanorMark({
  className,
  size = 32,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  void props;
  return (
    <Image
      src="/salanor-logo.png"
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, borderRadius: 6 }}
      priority
    />
  );
}
