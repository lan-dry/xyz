import Link from "next/link";

import styles from "../newsletter.module.css";

type Props = {
  searchParams: Promise<{ ok?: string; error?: string }>;
};

export default async function NewsletterConfirmPage({ searchParams }: Props) {
  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error;

  let title = "Confirm subscription";
  let body = "Use the link we emailed you to confirm.";

  if (ok) {
    title = "You are subscribed";
    body = "Thanks for confirming. You will receive Salanor updates at the email you verified.";
  } else if (error === "expired") {
    title = "Link expired";
    body = "Request a new subscription from the site footer and confirm within 72 hours.";
  } else if (error === "invalid") {
    title = "Invalid link";
    body = "This confirmation link is not valid. Subscribe again from the footer if you still want updates.";
  } else if (error === "server") {
    title = "Something went wrong";
    body = "Try the link again in a few minutes or contact us.";
  }

  return (
    <main className={styles.page}>
      <h1>{title}</h1>
      <p>{body}</p>
      <Link href="/" className={styles.link}>
        Home
      </Link>
    </main>
  );
}
