import { Badge, badgeVariants } from '@/components/ui/badge';
import { Severity } from '@/src/lib/analyzer';
import { type VariantProps } from 'class-variance-authority';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

const SEVERITY_BADGE_VARIANT: Record<Severity, BadgeVariant> = {
  critical: 'severity-critical',
  high: 'default',
  medium: 'severity-medium',
  low: 'outline',
  informational: 'ghost',
};

export function SeverityBadge({
  severity,
  count,
}: {
  severity: Severity;
  count?: number;
}) {
  return (
    <Badge variant={SEVERITY_BADGE_VARIANT[severity]} className="capitalize">
      {count !== undefined ? `${count} ${severity}` : severity}
    </Badge>
  );
}

export function severityBadgeVariant(severity: Severity): BadgeVariant {
  return SEVERITY_BADGE_VARIANT[severity];
}
