// Lives apart from layout.tsx so the docs site, which type-checks without the mod's JSX runtime, can load the renderers.
export type Seg = { text: string; color: string; bold?: boolean; bg?: string }
