import type { Metadata } from "next";
import "./globals.css";
import "./worlds.css";
import "./cockpit.css";
import "./breakout.css";
import "./profiles.css";

export const metadata: Metadata = {
  title: "Forma — A little more you.",
  description: "A place for your stories, in your own shape.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('forma-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{document.documentElement.dataset.theme='light'}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
