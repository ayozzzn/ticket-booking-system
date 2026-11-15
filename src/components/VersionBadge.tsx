export default function VersionBadge() {
  return (
    <span className="text-xs tracking-wide text-stone-400" title="Application version">
      v{__APP_VERSION__}
    </span>
  );
}