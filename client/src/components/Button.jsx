export default function Button({ variant, className, ...props }) {
  const classes = ["btn", variant && `btn-${variant}`, className].filter(Boolean).join(" ");
  return <button className={classes} {...props} />;
}
