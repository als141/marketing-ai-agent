export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-dvh overflow-hidden">{children}</div>;
}
