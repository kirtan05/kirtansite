export interface Experience {
  company: string;
  role: string;
  period: string;
  location: string;
  description: string[];
  current?: boolean;
}

export const experiences: Experience[] = [
  {
    company: 'Samsung Research Institute',
    role: 'R&D Engineer',
    period: 'Jul 2025 – Present',
    location: 'Noida, India',
    description: [
      'Maintaining and optimizing Android Framework components (Multi-window, PiP, Samsung DeX) for OneUI 8.5 & 9.0.',
      'Enhancing system stability across foldable flagships while ensuring seamless AOSP integration.',
    ],
    current: true,
  },
  {
    company: 'Sprinklr',
    role: 'Product Engineering Intern',
    period: 'May 2024 – Jul 2024',
    location: 'Gurgaon, India',
    description: [
      'Architected API caching middleware that slashed local development latency by 50%.',
      'Converted caching mechanism into a reusable npm package adopted across multiple teams.',
    ],
  },
];

export interface Achievement {
  text: string;
  highlight?: string;
}

export const achievements: Achievement[] = [
  {
    text: 'ICPC India Regional Finalist 2024 (Amritapuri)',
    highlight: 'ICPC',
  },
  { text: 'Codeforces Expert (Max: 1805)', highlight: '1805' },
  { text: 'KVPY Fellowship (SA-2019, SX-2020)', highlight: 'KVPY' },
  {
    text: 'JEE Advanced AIR 2194 (Top 1.5% of 150,000+)',
    highlight: 'AIR 2194',
  },
  {
    text: "General Secretary, Technical — Student Gymkhana '24-25",
    highlight: 'Gen Sec',
  },
  { text: 'Overall Events Head, Inter-IIT Cultural Meet 7.0' },
  {
    text: 'National Finalist, NTPC Electron Quiz. General Quiz Finalist at Nihilanth (IIM Calcutta).',
  },
];

export const education = {
  institution: 'Indian Institute of Technology, Patna',
  degree: 'B.Tech in Computer Science and Technology',
  period: '2021 – 2025',
  cpi: '7.52/10',
};
