export function detectLang(text: string): 'en' | 'zh' | 'mixed' {
  const hasCjk = /[一-鿿]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasCjk && hasLatin) return 'mixed';
  if (hasCjk) return 'zh';
  return 'en';
}
