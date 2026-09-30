export default function Fact({ label, value, mono }) {
  return (
    <div className="fact">
      <span className="label">{label}</span>
      <span className={`fact-value${mono ? " mono" : ""}`}>{value}</span>
    </div>
  );
}
