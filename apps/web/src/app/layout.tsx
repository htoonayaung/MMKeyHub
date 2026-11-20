import type { Metadata } from 'next';
import { JetBrains_Mono, Noto_Sans_Myanmar, Plus_Jakarta_Sans } from 'next/font/google';
import { CartDrawer } from '@/components/CartDrawer';
import { FloatingSupportButton } from '@/components/FloatingSupportButton';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { Navbar } from '@/components/Navbar';
import { CartProvider } from '@/providers/CartProvider';
import { LocaleProvider } from '@/providers/LocaleProvider';
import { TelegramProvider } from '@/providers/TelegramProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});

const notoMyanmar = Noto_Sans_Myanmar({
  subsets: ['myanmar'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-myanmar',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'MMKeyHub — Digital Keys, Accounts & VPNs in MMK',
  description:
    'Unified bilingual MMK digital product storefront for Web and Telegram Mini App with KPay and WavePay checkout.',
  icons: {
    icon: '/images/mmkeyhub-icon.png',
    apple: '/images/mmkeyhub-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${notoMyanmar.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0B0F17] dark:text-slate-50 antialiased">
        <ThemeProvider>
          <TelegramProvider>
            <LocaleProvider>
              <CartProvider>
                <div className="flex min-h-screen flex-col">
                  <Navbar />
                  <main className="flex-1">{children}</main>
                  <FloatingSupportButton />
                  <MobileBottomNav />
                  <CartDrawer />
                </div>
              </CartProvider>
            </LocaleProvider>
          </TelegramProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
