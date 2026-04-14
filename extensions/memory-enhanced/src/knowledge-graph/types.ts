export interface KnowledgeGraphEntity {
  id: string;
  type: string;
  name: string;
  description?: string;
}

export interface KnowledgeGraphRelationship {
  source: string;
  target: string;
  type: string;
  strength?: number;
}

export interface KnowledgeGraphInsight {
  id: string;
  text: string;
  confidence: number;
  sources: string[];
}

export interface KnowledgeGraphState {
  entities: KnowledgeGraphEntity[];
  relationships: KnowledgeGraphRelationship[];
  insights: KnowledgeGraphInsight[];
  lastUpdated: string;
  version: string;
}