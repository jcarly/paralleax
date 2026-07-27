export function RemoveRowButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button aria-label={label} className="ghost danger" type="button" onClick={onRemove}>
      x
    </button>
  );
}
