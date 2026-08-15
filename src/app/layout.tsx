export const metadata = {
  title: "Idea Router",
  description: "Review, split, and route employee ideas to teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f7f7f8" }}>
        {children}
      </body>
    </html>
  );
}
