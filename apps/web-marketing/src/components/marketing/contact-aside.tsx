import { getSiteContact } from "@/lib/site-contact";

import styles from "./contact-aside.module.css";

export function ContactAside() {
  const { intro, channels, social, address } = getSiteContact();

  return (
    <div className={styles.aside}>
      <p className={styles.intro}>{intro}</p>

      <ul className={styles.channels}>
        {channels.map((channel) => (
          <li key={channel.id} className={styles.channel}>
            <h2 className={styles.channelTitle}>{channel.label}</h2>
            <p className={styles.channelDesc}>{channel.description}</p>
            <a href={`mailto:${channel.email}`} className={styles.channelEmail}>
              {channel.email}
            </a>
          </li>
        ))}
      </ul>

      {social.length > 0 ? (
        <div className={styles.block}>
          <p className={styles.blockLabel}>Social</p>
          <ul className={styles.social}>
            {social.map((link) => (
              <li key={link.id}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {address.lines.length > 0 ? (
        <div className={styles.block}>
          <p className={styles.blockLabel}>{address.label}</p>
          <address className={styles.address}>
            {address.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </address>
        </div>
      ) : null}
    </div>
  );
}
