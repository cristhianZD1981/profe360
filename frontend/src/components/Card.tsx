export default function Card({ title, value }: { title: string; value: string | number }) {
  return <div className="card stat-card"><p className="muted">{title}</p><h3>{value}</h3></div>;
}
