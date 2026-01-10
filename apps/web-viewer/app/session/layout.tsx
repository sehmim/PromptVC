import { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Providers } from "../providers";

export default function SessionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Providers>
      <div className="flex h-screen overflow-hidden bg-white dark:bg-gray-900">
        <Suspense fallback={
          <aside className="w-80 bg-gray-100 dark:bg-gray-800 border-r border-gray-300 dark:border-gray-700 flex items-center justify-center">
            <div className="text-gray-500 text-sm">Loading...</div>
          </aside>
        }>
          <Sidebar />
        </Suspense>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </Providers>
  );
}
