'use client';
import { CURRENT_VERSION } from 'lib/constants';
import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <b>DevSolux</b> {`v${CURRENT_VERSION}`}
    </footer>
  );
}

export default Footer;
