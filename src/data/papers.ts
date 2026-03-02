export interface Paper {
  title: string;
  venue: string;
  year: number;
  description: string;
  links: { label: string; href: string }[];
}

export const papers: Paper[] = [
  {
    title:
      "When Words Can't Capture It All: Video-Based User Complaint Generation",
    venue: 'CIKM',
    year: 2025,
    description:
      'Defined CoD-V, a novel multimodal task for automated technical support reporting. Fine-tuned VideoLLama2 with MultiModal RAG on the curated ComVID benchmark (1,176 annotated videos).',
    links: [{ label: 'arXiv', href: '#' }],
  },
  {
    title: 'M3Hop-CoT: Misogynous Meme Identification',
    venue: 'EMNLP',
    year: 2024,
    description:
      'Proposed a Chain-of-Thought framework for detecting multimodal hate speech. Three-hop prompting strategy (Emotion, Target, Context) significantly outperformed unimodal baselines.',
    links: [{ label: 'arXiv', href: '#' }],
  },
];
