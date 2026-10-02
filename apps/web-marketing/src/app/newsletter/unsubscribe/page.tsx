import Link from "next/link";

import styles from "../newsletter.module.css";

type Props = {
  searchParams: Promise<{ ok?: string; error?: string }>;
};

export default async function NewsletterUnsubscribePage({ searchParams }: Props) {
  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error;

  let title = "Unsubscribe";
  let body = "Use the unsubscribe link in any Salanor email.";

  if (ok) {
    title = "You are unsubscribed";
    body =
      "We removed you from marketing updates. You will not receive further newsletters. (We keep a suppression record — industry standard — but will not email you again unless you re-subscribe and confirm.)";
  } else if (error === "invalid") {
    title = "Invalid link";
    body = "This unsubscribe link is not valid or has already been used.";
  } else if (error === "server") {
    title = "Something went wrong";
    body = "Try the link from your email again in a few minutes.";
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
