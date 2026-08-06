import { defineConfig } from 'vitepress';

const APP_URL = 'https://app.apiglimpse.com';

export default defineConfig({
  title: 'API Glimpse',
  description:
    'Developer docs for API Glimpse — add a connector, then see endpoints and schemas in the dashboard.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    [
      'link',
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
    ],
    [
      'link',
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    ],
    [
      'link',
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    ],
    [
      'link',
      {
        href: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap',
        rel: 'stylesheet',
      },
    ],
  ],

  themeConfig: {
    logo: { src: '/favicon.svg', alt: 'API Glimpse' },
    siteTitle: 'API Glimpse',
    nav: [
      { text: 'Guide', link: '/introduction' },
      { text: 'Connect', link: '/integrating' },
      {
        text: 'Dashboard',
        link: APP_URL,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      {
        text: 'Marketing',
        link: 'https://apiglimpse.com',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    ],

    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Introduction', link: '/introduction' },
          { text: 'Quick start', link: '/quick-start' },
          { text: 'Connect your app', link: '/integrating' },
        ],
      },
      {
        text: 'Understand',
        items: [
          { text: 'Architecture', link: '/architecture' },
          { text: 'Concepts', link: '/concepts' },
        ],
      },
    ],

    search: {
      provider: 'local',
    },

    socialLinks: [],

    footer: {
      message: 'Signup open on the dashboard · app.apiglimpse.com',
      copyright: 'API Glimpse · apiglimpse.com',
    },

    editLink: false,
  },
});
