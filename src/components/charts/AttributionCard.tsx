import styles from './AttributionCard.module.css';

interface Props {
  headline: string;
  bullets: readonly string[];
}

export default function AttributionCard({ headline, bullets }: Props) {
  return (
    <div className={styles.card}>
      <p className={styles.headline}>{headline}</p>
      {bullets.length > 0 && (
        <ul className={styles.bullets}>
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
