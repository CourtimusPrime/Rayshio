import { BudgetComparisonCard } from '../components/BudgetComparisonCard';
import { RecentInvoicesTable } from '../components/RecentInvoicesTable';
import { ServiceBreakdownChart } from '../components/ServiceBreakdownChart';
import { SpendSummaryCard } from '../components/SpendSummaryCard';

export function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <SpendSummaryCard />
        <BudgetComparisonCard />
      </div>

      <ServiceBreakdownChart />

      <RecentInvoicesTable limit={6} />
    </div>
  );
}
