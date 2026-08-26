import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trezor",
  description: "Pregled kredita, leasinga i osiguranja",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hr">
      <body>{children}</body>
    </html>
  );
}
