import type { Locale } from '@heremita/shared';
import type { Messages } from '@/messages/types';

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
