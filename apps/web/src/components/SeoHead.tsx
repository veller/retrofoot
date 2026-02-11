import type { ReactElement } from 'react';
import { Helmet } from 'react-helmet-async';
import { DEFAULT_OG_IMAGE, SITE_NAME, toCanonicalUrl } from '@/lib/seo';

interface SeoHeadProps {
  title: string;
  description: string;
  path?: string;
  noindex?: boolean;
  ogType?: 'website' | 'article';
}

export function SeoHead({
  title,
  description,
  path,
  noindex = false,
  ogType = 'website',
}: SeoHeadProps): ReactElement {
  const canonicalUrl = path ? toCanonicalUrl(path) : undefined;
  const robotsContent = noindex ? 'noindex, nofollow' : 'index, follow';

  return (
    <Helmet prioritizeSeoTags>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robotsContent} />

      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:image" content={DEFAULT_OG_IMAGE} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={DEFAULT_OG_IMAGE} />
    </Helmet>
  );
}
