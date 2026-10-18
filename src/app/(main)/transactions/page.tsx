import { TransactionsTable } from "@/components/transactions/TransactionsTable";

export default function TransactionsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">
            View and manage your transaction history.
          </p>
        </div>
      </div>
      <TransactionsTable />
    </div>
  );
}
