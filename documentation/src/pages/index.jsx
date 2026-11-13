import React from "react";
import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {websiteData, softwareData, serializeStructuredData} from '../utils/structuredData';
import MailDemo from "../components/MailDemo";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import styles from "./index.module.css";
const releaseUrl = "https://github.com/vschiavoni/thunderbird-gmail-skin/releases/latest";
function Icon({
  name,
  ...props
}) {
  const paths = {
    arrow: "M5 12h14m-6-6 6 6-6 6",
    inbox: "M4 4h16v16H4zM4 13h5l2 3h2l2-3h5",
    tag: "M3 4h8l10 10-7 7L3 10V4zm5 4h.01",
    search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
    check: "m5 12 4 4L19 6",
    mail: "M3 5h18v14H3zm0 0 9 8 9-8",
    code: "m8 5-7 7 7 7m8-14 7 7-7 7",
    book: "M12 5v16M2 3h6l4 2 4-2h6v16h-6l-4 2-4-2H2z"
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d={paths[name] || paths.mail} />
    </svg>;
}
const features = [{
  icon: "tag",
  title: "Labels and nested labels",
  text: "Apply colored labels to conversations, organize them in nested paths, and back up definitions and message assignments.",
  link: "/docs/labels",
  cta: "Label guide",
  className: "featureBlue"
}, {
  icon: "mail",
  title: "Conversation reading and replies",
  text: "An optional conversation reader brings related messages together. In-window replies and writing are experimental and off by default.",
  link: "/docs/settings#conversations",
  cta: "Reader settings",
  className: "featurePeach"
}, {
  icon: "clock",
  title: "Snooze conversations",
  text: "Move conversations out of the inbox until a chosen date. Reminders run locally and catch up when the client reopens online.",
  link: "/guides/snooze",
  cta: "How snooze works",
  className: "featureGreen"
}];
export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  const structuredData = {'@context': 'https://schema.org', '@graph': [websiteData(siteConfig), softwareData(siteConfig)]};
  return <Layout noFooter title="Thunder-G" description={"Thunder-G adds a Gmail-inspired interface to Thunderbird and Betterbird, with labels, conversation reading and in-window writing."}>
      <Head><meta name="twitter:title" content="Thunder-G"/><meta name="twitter:description" content="Thunder-G adds a Gmail-inspired interface to Thunderbird and Betterbird, with labels, conversation reading and in-window writing."/><script type="application/ld+json">{serializeStructuredData(structuredData)}</script></Head>
      <main className={styles.home}>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.editionLine}>
            <span>{"THUNDER-G / DESKTOP MAIL"}</span>
            <span>{"OPEN SOURCE"}</span>
          </div>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>{"For Thunderbird + Betterbird"}</div>
              <h1 id="home-title">{"Thunder"}<span className={styles.wordmarkEnd}>
                  -G<span className={styles.titlePeriod}>.</span>
                </span>
              </h1>
              <p className={styles.heroSubtitle}>{" A Gmail-style interface. "}<br />{" On your desktop. "}</p>
              <p className={styles.heroText}>{" Labels, conversations and in-window replies. "}<br />{" With the email accounts you already use. "}</p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryButton} to={releaseUrl}>{" Get Thunder-G "}<Icon name="arrow" />
                </Link>
              </div>
            </div>
            <div className={styles.heroArtwork}>
              <span className={styles.logoOrbit}>
                <img className={styles.heroLogo} src={useBaseUrl("/img/logo.png")} alt="Thunder-G" width="1280" height="1280" fetchPriority="high" />
              </span>
            </div>
          </div>
          <div className={styles.heroFacts}>
            <span>{"Your existing accounts"}</span>
            <span>{"Nested labels"}</span>
            <span>{"Light & dark themes"}</span>
          </div>
        </section>
        <section id="demo" className={styles.previewWrap} aria-label={"Interactive mail preview"}>
          <div className={styles.previewCaption}>
            <span>{"MAIL PREVIEW"}</span>
            <span>{"Sample mail · no account required"}</span>
          </div>
          <MailDemo />
        </section>
        <section className={styles.foundation} aria-label={"Built for your existing email"}>
          <span>{"Installation & compatibility"}</span>
          <span>{"Check supported client versions."}</span>
          <Link to="/overview#compatibility">{" Check compatibility "}<Icon name="arrow" />
          </Link>
        </section>
        <section className={styles.features}>
          <div className={styles.sectionIntro}>
            <p className={styles.kicker}>{"FEATURES"}</p>
            <h2>{" Labels, conversations "}<br />{" and snooze. "}</h2>
          </div>
          <div className={styles.featureGrid}>
            {features.map(feature => <article key={feature.title} className={`${styles.featureCard} ${styles[feature.className]}`}>
                <div className={styles.featureIcon}>
                  <Icon name={feature.icon} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
                <Link to={feature.link}>
                  {feature.cta}
                  <Icon name="arrow" />
                </Link>
              </article>)}
          </div>
        </section>
        <section className={styles.searchSection}>
          <div>
            <p className={styles.kicker}>{"SEARCH"}</p>
            <h2>{" Search by sender, "}<br />{" label or attachment. "}</h2>
            <p>{" Filter by sender, label, date or attachment. Search across your configured accounts using the mail available locally. "}</p>
            <Link className={styles.textLink} to="/docs/search">{" See the search guide "}<Icon name="arrow" />
            </Link>
          </div>
          <div className={styles.searchExample}>
            <div>
              <Icon name="search" />
              <code>label:projects has:attachment</code>
              <kbd>↵</kbd>
            </div>
            <p>{"Example: messages labeled Projects with attachments."}</p>
            <div className={styles.searchTokens}>
              <span>from:team</span>
              <span>newer_than:7d</span>
              <span>is:unread</span>
            </div>
          </div>
        </section>
        <section className={styles.getStarted} id="get-started">
          <div>
            <p className={styles.kicker}>{"INSTALLATION"}</p>
            <h2>{"Install the XPI. Restart your client."}</h2>
          </div>
          <ol className={styles.steps}>
            <li>
              <span>01</span>
              <div>
                <h3>{"Download the add-on"}</h3>
                <p>{" Get the "}<code>{".xpi"}</code>{" file from the latest release. "}</p>
                <Link to={releaseUrl}>{" Open latest release "}<Icon name="arrow" />
                </Link>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>{"Install from file"}</h3>
                <p>{" In Thunderbird or Betterbird, open Add-ons Manager → gear → Install Add-on From File. Select the XPI and restart. "}</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>{"Configure the layout"}</h3>
                <p>{" Use System theme, Classic layout and Table View. Optional features are in Thunder-G Preferences. "}</p>
                <Link to="/guides/getting-started">{" Follow the first-run guide "}<Icon name="arrow" />
                </Link>
              </div>
            </li>
          </ol>
        </section>
        <section className={styles.faq}>
          <div>
            <p className={styles.kicker}>{"QUESTIONS"}</p>
            <h2>{"Before installing"}</h2>
          </div>
          <div className={styles.faqItems}>
            <details>
              <summary>{"Do I need to use Gmail?"}</summary>
              <p>{" No. Thunder-G changes the Thunderbird interface and works with your existing email provider. Gmail label import is a separate, optional feature. "}</p>
            </details>
            <details>
              <summary>{"Does it work with Thunderbird and Betterbird?"}</summary>
              <p>{" Yes. The extension declares Thunderbird 153–159.x support. Betterbird 153.5.0esr-bb11 has also been tested on macOS. See the platform details and testing limits in the"}{" "}
                <Link to="/overview#compatibility">{"compatibility table"}</Link>.
              </p>
            </details>
            <details>
              <summary>{"Are all features enabled from the start?"}</summary>
              <p>{" No. Conversation reading and in-window writing are experimental and off by default. Review"}{" "}
                <Link to="/docs/settings">{" settings and compatibility notes "}</Link>{" "}{" before enabling them. "}</p>
            </details>
            <details>
              <summary>{"Where can I get help or contribute?"}</summary>
              <p>{" Start with"}{" "}
                <Link to="/docs/troubleshooting">{"troubleshooting"}</Link>{" or the"}{" "}
                <Link to="/docs/development">{"development guide"}</Link>{". Bugs and contributions are welcome on"}{" "}
                <Link to="https://github.com/vschiavoni/thunderbird-gmail-skin">{" GitHub "}</Link>
                .
              </p>
            </details>
          </div>
        </section>
        <footer id="site-footer" className={styles.siteFooter}>
          <div className={styles.footerTop}>
            <span>{"THUNDER-G"}</span>
            <span>{"DOWNLOAD · DOCUMENTATION · SOURCE"}</span>
          </div>
          <Link className={styles.footerDownload} to={releaseUrl}>
            <span>{" Download "}<br />{"Thunder-G."}</span>
          </Link>
          <div className={styles.footerLinks}>
            <div>
              <span>{"01 / INSTALL"}</span>
              <Link to={releaseUrl}>{"Download the add-on"}</Link>
              <Link to="/guides/getting-started">{"First-run guide"}</Link>
            </div>
            <div>
              <span>{"02 / DOCUMENTATION"}</span>
              <Link to="/docs/settings">{"Settings"}</Link>
              <Link to="/documentation">{"Documentation"}</Link>
            </div>
            <div>
              <span>{"03 / CONTRIBUTE"}</span>
              <Link to="https://github.com/vschiavoni/thunderbird-gmail-skin">{" Source on GitHub "}</Link>
              <Link to="https://github.com/vschiavoni/thunderbird-gmail-skin/issues">{" Report an issue "}</Link>
            </div>
          </div>
          <div className={styles.footerWordmark} aria-label={"Thunder-G"}>
            <img src={useBaseUrl("/img/logo.png")} alt="" />
            <span>{"Thunder-G"}<span className={styles.footerDot}>.</span>
            </span>
          </div>
          <div className={styles.footerLegal}>
            <span>{"Independent. Open source."}</span>
            <span>{" Gmail is a trademark of Google LLC. No affiliation with Google. "}</span>
            <a href="#home-title">{"Back to top"}</a>
          </div>
        </footer>
      </main>
    </Layout>;
}
