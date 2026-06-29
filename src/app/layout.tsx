import type { Metadata, Viewport } from "next";
import ServiceWorker from "@/components/ServiceWorker";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocVault",
  description: "Personal document vault — upload, preview and manage your important documents",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "DocVault" },
  icons: { icon: "/favicon.svg", apple: "/icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a0c10",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
          integrity="sha384-XGjxtQfXaH2tnPFa9x+ruJTuLE3Aa6LhHSWRr1XeTyhezb4abCG4ccI5AkVDxqC+"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <ServiceWorker />
        </ThemeProvider>
      </body>
    </html>
  );
}


