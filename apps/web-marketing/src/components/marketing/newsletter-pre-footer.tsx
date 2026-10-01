import { NewsletterSignup } from "./newsletter-signup";
import band from "./newsletter-pre-footer.module.css";

export function NewsletterPreFooter() {
  return (
    <section className={band.section} aria-labelledby="site-newsletter-heading">
      <div className={band.inner}>
        <div className={band.copy}>
          <h2 id="site-newsletter-heading" className={band.title}>
            Updates
          </h2>
          <p className={band.lead}>
            Research and product notes — double opt-in, unsubscribe anytime.
          </p>
        </div>
        <div className={band.formWrap}>
          <NewsletterSignup layout="inline" />
        </div>
      </div>
    </section>
  );
}
