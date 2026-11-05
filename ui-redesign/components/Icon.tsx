export function Icon({ name }: { name: string }) {
  return (
    <span className="icon material-symbols-outlined" aria-hidden="true">
      {name}
    </span>
  );
}
