type WordmarkProps = {
  size?: 'sm' | 'md';
};

/** Brand wordmark placeholder until Lovable prototype assets are synced. */
export default function Wordmark({ size = 'md' }: WordmarkProps) {
  const fontSize = size === 'sm' ? '1rem' : '1.125rem';
  return (
    <span className="wordmark" style={{ fontWeight: 700, fontSize }}>
      1CommandAI
    </span>
  );
}
