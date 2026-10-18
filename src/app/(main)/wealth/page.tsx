import { PositionsTable } from "@/components/positions/PositionsTable";
import { AssetAllocationWidget } from '@/components/dashboard/widgets/AssetAllocationWidget';
import { WealthGoalWidget } from '@/components/dashboard/WealthGoalWidget';

export default function PositionsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Positions</h1>
        <p className="text-muted-foreground">
          A summary of your current asset holdings.
        </p>
      </div>
      
      {/* 🎯 Top Section: Goal + Allocation (Side by Side) */}
      <div className="grid gap-6 md:grid-cols-2 min-h-[380px]">
          {/* Left: Wealth Goal (50%) */}
          <div className="h-full">
            <WealthGoalWidget />
          </div>
          
          {/* Right: Asset Ring (50%) */}
          <div className="h-full">
            <AssetAllocationWidget />
          </div>
      </div>

      <PositionsTable />
    </div>
  );
}
