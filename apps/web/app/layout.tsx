import type { Metadata } from "next";
import "./globals.css";
import "./worlds.css";
import "./cockpit.css";
import "./breakout.css";
import "./profiles.css";
import "./identity.css";
import "./smudge.css";
import "./easy-editor.css";
import "./site-import.css";
import "./post-editor.css";
import "./social-basics.css";
import "./privacy-groups.css";
import "./gallery.css";
import "./themes.css";
import "./sides.css";
import "./nav.css";
import { seasonScript } from "../components/season-script";

export const metadata: Metadata = {
  title: "Smudge",
  description:
    "Make your corner of the internet. Posts that open into whole pages, right inside the app.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Rubik+Spray+Paint&family=Familjen+Grotesk:wght@400;500;600;700&family=Caveat+Brush&family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Instrument+Serif:ital@0;1&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: seasonScript }} />
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
