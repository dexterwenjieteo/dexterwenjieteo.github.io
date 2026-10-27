export const profile = {
  name: 'Dexter Wen Jie Teo',
  role: 'Medical Image Computing Researcher',
  affiliation: 'Nanyang Technological University, Singapore',
  email: 'WTEO030@e.ntu.edu.sg',
  site: 'https://dexterwenjieteo.github.io',
  description: 'Academic homepage of Dexter Wen Jie Teo, a Computer Engineering researcher at Nanyang Technological University working on spatiotemporal medical image analysis, robust segmentation, and medical AI.',
  biography: 'I am a final-year Computer Engineering undergraduate at Nanyang Technological University, Singapore. My research focuses on medical image analysis, particularly spatiotemporal deep learning and robust segmentation. I have conducted research at Polytechnique Montréal and the University of Alberta, both in Canada, working on cardiac cine-MRI and multi-centre brain MRI analysis.',
  scholar: 'https://scholar.google.com/citations?user=NXlm0_UAAAAJ&hl=en',
  linkedin: 'https://www.linkedin.com/in/dexter-teo/',
  github: 'https://github.com/dexterwenjieteo',
  // Browser-ready derivative of the original HEIC photo; use null for a placeholder.
  portrait: '/images/portrait.webp' as string | null,
  cv: '/cv/Dexter_Wen_Jie_Teo_CV.pdf',
  // Date this public-safe derivative was prepared, not the source CV's authoring date.
  cvUpdated: '2026-10-27',
  cvUpdatedLabel: '27 October 2026',
};

export const researchThemes = [
  {
    title: 'Spatiotemporal medical image analysis',
    description: 'Temporal tracking, anatomical motion modelling, and segmentation consistency in dynamic cardiac imaging.',
    topics: 'Cardiac cine-MRI · Anatomical tracking',
  },
  {
    title: 'Robust and generalizable medical AI',
    description: 'Multi-centre imaging, domain generalization, and robust stroke lesion segmentation across diverse imaging settings.',
    topics: 'Multi-centre MRI · Domain generalization',
  },
  {
    title: 'Efficient and multimodal learning',
    description: 'Efficient temporal representations, recurrent architectures, and learning from imaging and clinical information.',
    topics: 'Temporal representations · Multimodal fusion',
  },
];
