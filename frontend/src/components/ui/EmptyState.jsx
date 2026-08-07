export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-14 h-14 bg-surface-alt rounded-full flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-faint" />
        </div>
      )}
      <h3 className="text-base font-medium text-ink">{title}</h3>
      {description && <p className="text-sm text-muted mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
