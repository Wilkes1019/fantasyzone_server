import './globals.css';
export const metadata = {
  title: 'Fantasy Zone Server',
  description: 'APIs and admin for Fantasy Zone',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <div className="title">Fantasy Zone Admin</div>
        </header>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}

