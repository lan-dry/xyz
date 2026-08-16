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

/** Company mark — vector S (public/brand/salanor-mark-master.svg). */
export function SalanorMark({
  className,
  size = 32,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden
      {...props}
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M44.5 19.5c0-6.8-6.2-11-13-11-8.2 0-13.5 4.5-13.5 10.8 0 6.2 5.2 9.2 13.8 11.2 8.2 2 13.7 4.5 13.7 11.5 0 7.2-6.5 12-15.5 12-8.5 0-15-4.8-15-11.8"
      />
    </svg>
  );
}
