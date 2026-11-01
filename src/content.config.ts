import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const works = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/works' }),
  schema: z.object({
    title: z.string(),
    titleEn: z.string().optional(),
    year: z.number(),
    order: z.number().default(99),
    category: z.string(),
    medium: z.string(),
    dimensions: z.string().optional(),
    duration: z.string().optional(),
    video: z.string().optional(),
    cover: z.string(),
    images: z.array(z.string()).default([]),
    public: z.boolean().default(false),
    short: z.string().optional(),
    statement: z.string(),
  }),
});

export const collections = { works };
