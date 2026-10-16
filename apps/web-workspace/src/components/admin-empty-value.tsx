import ui from "@/components/admin-ui.module.css";

type AdminEmptyValueProps = {
  /** Short label when a field has no value (never an em dash). */
  children?: string;
};

export function AdminEmptyValue({
  children = "None",
}: AdminEmptyValueProps) {
  return <span className={ui.emptyValue}>{children}</span>;
}
