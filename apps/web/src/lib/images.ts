const base = process.env['NEXT_PUBLIC_IMAGE_BASE_URL'] ?? '';

export const imageUrl = (key: string) => `${base}/${key}`;

// next/image does not optimize SVG. Only placeholders and the logo are SVG.
export const isVector = (key: string) => key.endsWith('.svg');
