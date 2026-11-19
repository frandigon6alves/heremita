import type { ReactNode } from 'react';
import styles from './legal-page.module.css';

interface LegalPageProps {
  title: string;
  lead: string;
  children: ReactNode;
}

/** Shell of the static About and Privacy pages: heading, lead and readable-width sections. */
export function LegalPage({ title, lead, children }: LegalPageProps) {
  return (
    <main id="main" className={styles.main}>
      <article className={styles.article}>
        <header className={styles.header}>
          <h1>{title}</h1>
          <p className={styles.lead}>{lead}</p>
        </header>
        {children}
      </article>
    </main>
  );
}

interface LegalSectionProps {
  heading: string;
  children: ReactNode;
}

export function LegalSection({ heading, children }: LegalSectionProps) {
  return (
    <section className={styles.section}>
      <h2>{heading}</h2>
      {children}
    </section>
  );
}

/** A bulleted list of `<li>` sentences inside a section. */
export function LegalList({ children }: { children: ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

/** `t.rich` tag renderer for a link to another site. */
export function externalLink(href: string) {
  function ExternalLink(chunks: ReactNode) {
    return <a href={href}>{chunks}</a>;
  }
  return ExternalLink;
}
