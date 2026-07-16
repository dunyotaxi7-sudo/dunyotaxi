export function PageStub({
  title,
  points,
}: {
  title: string;
  points: string[];
}) {
  return (
    <div className="card p-8 max-w-2xl">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">
        Keyingi bosqichda rejalashtirilgan. Bu sahifa ulangan va API mijozi
        uning endpointlarini qamrab olgan.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm list-disc pl-5 text-foreground/80">
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
