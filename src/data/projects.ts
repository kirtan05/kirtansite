export interface Project {
  title: string;
  description: string;
  longDescription?: string;
  tech: string[];
  links: { label: string; href: string }[];
  featured?: boolean;
}

export const projects: Project[] = [
  {
    title: 'OneIITP',
    description:
      'Unified campus companion app for IIT Patna — live bus tracking, marketplace, events.',
    longDescription:
      'Developed the campus companion app serving 2000+ active students. Integrates live bus tracking, marketplace, and event updates into a scalable React Native platform.',
    tech: ['React Native', 'TypeScript', 'Firebase'],
    links: [
      { label: 'Play Store', href: '#' },
      { label: 'App Store', href: '#' },
    ],
    featured: true,
  },
  {
    title: 'Alloc8',
    description:
      'Room allocation portal — 3000 students into 1400 rooms in minutes.',
    longDescription:
      'Led development of a portal streamlining hostel room allocation. Redis-based distributed locks ensure atomic room selection. Hosted on AWS Lightsail with Caddy load-balancing.',
    tech: ['React', 'Node.js', 'MongoDB', 'Redis', 'AWS'],
    links: [{ label: 'Website', href: '#' }],
    featured: true,
  },
  {
    title: 'Sprinklr Middleware',
    description:
      'API caching middleware — slashed local dev latency by 50%.',
    longDescription:
      'Architected a middleware solution to capture and mock GraphQL/REST API responses. Converted into a reusable npm package adopted across multiple teams.',
    tech: ['TypeScript', 'GraphQL', 'npm'],
    links: [],
    featured: true,
  },
  {
    title: 'Quiz Finder India',
    description:
      'AI-powered quiz aggregator — monitors 75+ sources across India with GPT-4o extraction.',
    longDescription:
      'Aggregates quiz announcements from WhatsApp groups and Instagram pages across 35+ cities. GPT-4o reads posters and captions to extract event details. Features city filtering, eligibility tags, push notifications, and one-click calendar integration.',
    tech: ['Next.js', 'GPT-4o', 'Vercel'],
    links: [
      { label: 'Website', href: 'https://quizfinderindia.vercel.app' },
      { label: 'GitHub', href: 'https://github.com/kirtan05/quizfinderindia' },
    ],
    featured: true,
  },
];
