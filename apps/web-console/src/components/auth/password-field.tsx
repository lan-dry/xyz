"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes } from "react";

import styles from "./password-field.module.css";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  /** Optional class for the outer label wrapper (auth pages use login.module.css `.field`) */
  fieldClassName?: string;
  inputClassName?: string;
};

export function PasswordField({
  label,
  fieldClassName,
  inputClassName,
  id: idProp,
  ...inputProps
}: Props) {
  const genId = useId();
  const id = idProp ?? genId;
  const [visible, setVisible] = useState(false);

  return (
    <label className={fieldClassName} htmlFor={id}>
      <span>{label}</span>
      <span className={styles.wrap}>
        <input
          {...inputProps}
          id={id}
          className={[styles.input, inputClassName].filter(Boolean).join(" ")}
          type={visible ? "text" : "password"}
        />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {visible ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
        </button>
      </span>
    </label>
  );
}
