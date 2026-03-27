import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Geist,Geist_Mono } from 'next/font/google';
import { cn } from '@/lib/cn';

const geist = Geist({
  subsets: ['latin'],
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={cn(geist.className,geistMono.className)} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen font-mono antialiased">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
