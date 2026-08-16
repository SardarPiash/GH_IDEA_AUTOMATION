import Nav from "@/components/Nav";
import "./globals.css";

export const metadata = {
  title: "Idea Router",
  description: "Review, split, and route employee ideas to teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
