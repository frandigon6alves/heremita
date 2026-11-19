type FormatterConstructor<Options, Formatter> = new (
  locale: string,
  options?: Options,
) => Formatter;

const caches = new WeakMap<object, Map<string, unknown>>();

/**
 * One `Intl` formatter per constructor, locale and options, built on first
 * use: building one is far slower than formatting with it, and lists of legs,
 * stops and reviews format the same way many times per render.
 */
export function cachedFormatter<Options, Formatter>(
  Constructor: FormatterConstructor<Options, Formatter>,
  locale: string,
  options: Options,
): Formatter {
  let byKey = caches.get(Constructor) as Map<string, Formatter> | undefined;
  if (byKey === undefined) {
    byKey = new Map();
    caches.set(Constructor, byKey);
  }
  const key = `${locale}\u0000${JSON.stringify(options)}`;
  let formatter = byKey.get(key);
  if (formatter === undefined) {
    formatter = new Constructor(locale, options);
    byKey.set(key, formatter);
  }
  return formatter;
}
