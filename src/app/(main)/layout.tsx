import AuthLayout from "@/app/(auth)/layout";
import MainLayout from "@/components/layout/MainLayout";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthLayout>
      <MainLayout>{children}</MainLayout>
    </AuthLayout>
  );
}
