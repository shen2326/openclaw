export interface SemanticLink {
  source: string;
  target: string;
  similarity: number;
  commonConcepts: string[];
  timestamp: string;
}

export interface SemanticLinkingState {
  links: SemanticLink[];
  lastProcessed: string;
  version: string;
}

export interface SemanticLinkingConfig {
  enabled?: boolean;
  threshold?: number;
  maxLinksPerEntry?: number;
}