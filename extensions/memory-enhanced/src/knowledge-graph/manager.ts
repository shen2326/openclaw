import { type PluginContext } from "openclaw/plugin-sdk";
import { KnowledgeGraphState, KnowledgeGraphEntity, KnowledgeGraphRelationship, KnowledgeGraphInsight } from "./types.js";
import { MemoryEntry } from "../types.js";
import fs from "node:fs/promises";
import path from "node:path";

export class KnowledgeGraphManager {
  private context: PluginContext;
  private config: any;
  private graphPath: string;
  
  constructor(context: PluginContext, config?: any) {
    this.context = context;
    this.config = config ?? {};
    this.graphPath = path.join(context.workspaceDir, "memory", "knowledge-graph.json");
  }
  
  async initialize(): Promise<void> {
    this.context.logger.info("Initializing Knowledge Graph Manager");
    
    // Register event handlers
    this.context.events.on("memory.updated", async (event) => {
      await this.processMemoryUpdate(event);
    });
    
    // Load or create initial graph
    await this.loadGraph();
  }
  
  private async loadGraph(): Promise<KnowledgeGraphState> {
    try {
      const data = await fs.readFile(this.graphPath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const initialState: KnowledgeGraphState = {
          entities: [],
          relationships: [],
          insights: [],
          lastUpdated: new Date().toISOString(),
          version: "1.0.0"
        };
        await this.saveGraph(initialState);
        return initialState;
      }
      throw error;
    }
  }
  
  private async saveGraph(state: KnowledgeGraphState): Promise<void> {
    await fs.mkdir(path.dirname(this.graphPath), { recursive: true });
    await fs.writeFile(this.graphPath, JSON.stringify(state, null, 2));
  }
  
  private async processMemoryUpdate(event: any): Promise<void> {
    if (!this.config.enabled) return;
    
    this.context.logger.debug("Processing memory update for knowledge graph");
    
    const graph = await this.loadGraph();
    const memoryEntries = await this.getMemoryEntries();
    
    // Extract entities and relationships from new entries
    const newEntities: KnowledgeGraphEntity[] = [];
    const newRelationships: KnowledgeGraphRelationship[] = [];
    
    for (const entry of memoryEntries) {
      const entities = this.extractEntities(entry.content);
      const relationships = this.extractRelationships(entry.content, entities);
      
      newEntities.push(...entities);
      newRelationships.push(...relationships);
    }
    
    // Merge with existing graph (avoid duplicates)
    const updatedEntities = this.mergeEntities(graph.entities, newEntities);
    const updatedRelationships = this.mergeRelationships(graph.relationships, newRelationships);
    
    // Generate insights from the updated graph
    const newInsights = this.generateInsights(updatedEntities, updatedRelationships);
    const updatedInsights = [...graph.insights, ...newInsights];
    
    const updatedGraph: KnowledgeGraphState = {
      entities: updatedEntities,
      relationships: updatedRelationships,
      insights: updatedInsights,
      lastUpdated: new Date().toISOString(),
      version: "1.0.0"
    };
    
    await this.saveGraph(updatedGraph);
    this.context.logger.info(`Updated knowledge graph: ${updatedEntities.length} entities, ${updatedRelationships.length} relationships`);
  }
  
  private async getMemoryEntries(): Promise<MemoryEntry[]> {
    const memoryDir = path.join(this.context.workspaceDir, "memory");
    const files = await fs.readdir(memoryDir);
    const entries: MemoryEntry[] = [];
    
    for (const file of files) {
      if (file.endsWith(".md") && file !== "MEMORY.md") {
        const content = await fs.readFile(path.join(memoryDir, file), "utf-8");
        const timestamp = file.replace(".md", "");
        entries.push({ file, content, timestamp });
      }
    }
    
    return entries;
  }
  
  private extractEntities(content: string): KnowledgeGraphEntity[] {
    const entities: KnowledgeGraphEntity[] = [];
    
    // Simple entity extraction based on patterns
    // In production, this would use proper NLP
    
    // Extract capitalized words/phrases that might be entities
    const potentialEntities = content.match(/\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\b/g) || [];
    
    for (const entity of potentialEntities) {
      // Filter out common words and very short entities
      if (entity.length > 3 && !this.isCommonWord(entity)) {
        entities.push({
          id: this.generateEntityId(entity),
          type: this.determineEntityType(entity),
          name: entity,
          description: this.extractEntityDescription(content, entity)
        });
      }
    }
    
    // Extract specific patterns like **bold** text (often important concepts)
    const boldEntities = content.match(/\*\*([^*]+)\*\*/g) || [];
    for (const bold of boldEntities) {
      const entityName = bold.replace(/\*\*/g, "").trim();
      if (entityName.length > 2) {
        entities.push({
          id: this.generateEntityId(entityName),
          type: "concept",
          name: entityName,
          description: `Key concept from memory entry`
        });
      }
    }
    
    return entities;
  }
  
  private extractRelationships(content: string, entities: KnowledgeGraphEntity[]): KnowledgeGraphRelationship[] {
    const relationships: KnowledgeGraphRelationship[] = [];
    
    // Simple relationship extraction based on proximity and keywords
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];
        
        // Check if entities appear close to each other in text
        const distance = this.getEntityDistance(content, entity1.name, entity2.name);
        if (distance < 50) { // Within 50 characters
          relationships.push({
            source: entity1.id,
            target: entity2.id,
            type: "related",
            strength: 1 - (distance / 50)
          });
        }
      }
    }
    
    return relationships;
  }
  
  private mergeEntities(existing: KnowledgeGraphEntity[], newOnes: KnowledgeGraphEntity[]): KnowledgeGraphEntity[] {
    const entityMap = new Map<string, KnowledgeGraphEntity>();
    
    // Add existing entities
    for (const entity of existing) {
      entityMap.set(entity.id, entity);
    }
    
    // Add new entities (avoiding duplicates)
    for (const entity of newOnes) {
      if (!entityMap.has(entity.id)) {
        entityMap.set(entity.id, entity);
      }
    }
    
    return Array.from(entityMap.values());
  }
  
  private mergeRelationships(existing: KnowledgeGraphRelationship[], newOnes: KnowledgeGraphRelationship[]): KnowledgeGraphRelationship[] {
    const relationshipSet = new Set<string>();
    const merged: KnowledgeGraphRelationship[] = [];
    
    // Add existing relationships
    for (const rel of existing) {
      const key = `${rel.source}-${rel.target}-${rel.type}`;
      if (!relationshipSet.has(key)) {
        relationshipSet.add(key);
        merged.push(rel);
      }
    }
    
    // Add new relationships (avoiding duplicates)
    for (const rel of newOnes) {
      const key = `${rel.source}-${rel.target}-${rel.type}`;
      if (!relationshipSet.has(key)) {
        relationshipSet.add(key);
        merged.push(rel);
      }
    }
    
    return merged;
  }
  
  private generateInsights(entities: KnowledgeGraphEntity[], relationships: KnowledgeGraphRelationship[]): KnowledgeGraphInsight[] {
    const insights: KnowledgeGraphInsight[] = [];
    
    // Generate insights based on graph patterns
    if (entities.length > 5) {
      insights.push({
        id: `insight-${Date.now()}`,
        text: `Knowledge base contains ${entities.length} distinct concepts with ${relationships.length} relationships`,
        confidence: 0.9,
        sources: ["knowledge-graph-analysis"]
      });
    }
    
    // Find highly connected entities (hubs)
    const entityConnections = new Map<string, number>();
    for (const rel of relationships) {
      entityConnections.set(rel.source, (entityConnections.get(rel.source) || 0) + 1);
      entityConnections.set(rel.target, (entityConnections.get(rel.target) || 0) + 1);
    }
    
    const hubs = Array.from(entityConnections.entries())
      .filter(([_, connections]) => connections > 2)
      .map(([id, connections]) => ({ id, connections }))
      .sort((a, b) => b.connections - a.connections);
    
    if (hubs.length > 0) {
      const hubEntity = entities.find(e => e.id === hubs[0].id);
      if (hubEntity) {
        insights.push({
          id: `insight-hub-${Date.now()}`,
          text: `Central concept "${hubEntity.name}" connects to ${hubs[0].connections} other concepts`,
          confidence: 0.85,
          sources: ["knowledge-graph-analysis"]
        });
      }
    }
    
    return insights;
  }
  
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      "The", "And", "For", "With", "From", "About", "This", "That", "These", "Those",
      "OpenClaw", "Memory", "Learning", "System", "User", "Assistant", "Plugin"
    ]);
    return commonWords.has(word);
  }
  
  private determineEntityType(entity: string): string {
    // Simple heuristics to determine entity type
    if (entity.includes("Fish")) return "algorithm";
    if (entity.includes("MCP")) return "framework";
    if (entity.includes("PSO")) return "technique";
    if (entity.includes("Engineering")) return "domain";
    if (entity.includes("Compression")) return "technique";
    return "concept";
  }
  
  private extractEntityDescription(content: string, entity: string): string | undefined {
    // Find sentence containing the entity
    const sentences = content.split(/[.!?]/);
    for (const sentence of sentences) {
      if (sentence.includes(entity)) {
        return sentence.trim();
      }
    }
    return undefined;
  }
  
  private getEntityDistance(content: string, entity1: string, entity2: string): number {
    const pos1 = content.indexOf(entity1);
    const pos2 = content.indexOf(entity2);
    if (pos1 === -1 || pos2 === -1) return Infinity;
    return Math.abs(pos1 - pos2);
  }
  
  private generateEntityId(entity: string): string {
    return entity.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  }
}