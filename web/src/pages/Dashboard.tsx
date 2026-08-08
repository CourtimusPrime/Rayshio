import { RecentInvoicesTable } from '../components/RecentInvoicesTable';
import { ServiceBreakdownChart } from '../components/ServiceBreakdownChart';

export function Dashboard() {
  return (
    <div className="space-y-6">
      {/*
        One lead section, not two. The month's totals used to sit in a separate
        card above this one, which meant the headline figure and the vendors
        that produced it were different objects reporting the same month; the
        totals are now the lead statistics of the section that explains them.
      */}
      <ServiceBreakdownChart />

      <RecentInvoicesTable limit={6} />
    </div>
  );
}
