export default function Panel({ as: Tag = "section", title, aside, className, children }) {
  return (
    <Tag className={["panel", className].filter(Boolean).join(" ")}>
      {title && (
        <div className="panel-head">
          <span className="label">{title}</span>
          {aside}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </Tag>
  );
}
