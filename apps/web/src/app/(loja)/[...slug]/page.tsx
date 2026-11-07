import { notFound } from 'next/navigation';

// Unmatched public URLs end here so the 404 renders inside the storefront layout (header and footer).
export default function UnmatchedPage() {
  notFound();
}
