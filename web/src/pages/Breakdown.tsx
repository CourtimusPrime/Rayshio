import { CategoryBreakdownChart } from '../components/CategoryBreakdownChart';
import { CategoryDetailList } from '../components/CategoryDetailList';

export function Breakdown() {
  return (
    <div className="space-y-6">
      <CategoryDetailList />
      <CategoryBreakdownChart />
    </div>
  );
}
