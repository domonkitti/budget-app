import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { SnapshotProvider } from "./SnapshotProvider";

export const metadata: Metadata = {
  title: "Budget App",
  description: "Budget allocation dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <SnapshotProvider>
          <Navbar />
          {children}
        </SnapshotProvider>
      </body>
    </html>
  );
}
