import { type PluginContext } from "openclaw/plugin-sdk";
import { SemanticLinkingConfig, SemanticLinkingState } from "./types.js";
import { MemoryEntry } from "../types.js";
import fs from "node:fs/promises";
import path from "node:path";

export class SemanticLinkingManager {
  private context: PluginContext;
  private config: SemanticLinkingConfig;
  private statePath: string;
  
  constructor(context: PluginContext, config?: SemanticLinkingConfig) {
    this.context = context;
    this.config = {
      enabled: true,
      threshold: 0.8,
      maxLinksPerEntry: 5,
      ...config
    };
    this.statePath = path.join(context.workspaceDir, "memory", ".semantic-linking-state.json");
  }
  
  async initialize(): Promise<void> {
    this.context.logger.info("Initializing Semantic Linking Manager");
    
    // Register event handlers for memory updates
    this.context.events.on("memory.updated", async (event) => {
      await this.processMemoryUpdate(event);
    });
    
    // Load existing state or create new one
    await this.loadState();
  }
  
  private async loadState(): Promise<SemanticLinkingState> {
    try {
      const data = await fs.readFile(this.statePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const initialState: SemanticLinkingState = {
          links: [],
          lastProcessed: new Date().toISOString(),
          version: "1.0.0"
        };
        await this.saveState(initialState);
        return initialState;
      }
      throw error;
    }
  }
  
  private async saveState(state: SemanticLinkingState): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2));
  }
  
  private async processMemoryUpdate(event: any): Promise<void> {
    if (!this.config.enabled) return;
    
    this.context.logger.debug("Processing memory update for semantic linking");
    
    const state = await this.loadState();
    const memoryEntries = await this.getMemoryEntries();
    
    // Find new entries to process
    const newEntries = memoryEntries.filter(entry => 
      entry.timestamp > state.lastProcessed
    );
    
    if (newEntries.length === 0) return;
    
    // Compute similarities and create links
    const newLinks = await this.computeSemanticLinks(newEntries, memoryEntries);
    
    // Update state
    const updatedState: SemanticLinkingState = {
      links: [...state.links, ...newLinks],
      lastProcessed: new Date().toISOString(),
      version: "1.0.0"
    };
    
    await this.saveState(updatedState);
    this.context.logger.info(`Created ${newLinks.length} new semantic links`);
  }
  
  private async getMemoryEntries(): Promise<MemoryEntry[]> {
    // Get all memory entries from memory/ directory
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
  
  private async computeSemanticLinks(
    newEntries: MemoryEntry[], 
    allEntries: MemoryEntry[]
  ): Promise<any[]> {
    const links: any[] = [];
    
    for (const newEntry of newEntries) {
      const entryLinks: any[] = [];
      
      for (const existingEntry of allEntries) {
        if (existingEntry.file === newEntry.file) continue;
        
        const similarity = await this.computeSimilarity(newEntry.content, existingEntry.content);
        if (similarity >= (this.config.threshold ?? 0.8)) {
          const commonConcepts = this.extractCommonConcepts(newEntry.content, existingEntry.content);
          entryLinks.push({
            source: newEntry.file,
            target: existingEntry.file,
            similarity,
            commonConcepts,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // Sort by similarity and limit to maxLinksPerEntry
      entryLinks.sort((a, b) => b.similarity - a.similarity);
      links.push(...entryLinks.slice(0, this.config.maxLinksPerEntry ?? 5));
    }
    
    return links;
  }
  
  private async computeSimilarity(text1: string, text2: string): Promise<number> {
    // Simple cosine similarity implementation
    // In production, this would use proper embeddings
    const words1 = this.tokenize(text1);
    const words2 = this.tokenize(text2);
    
    const commonWords = words1.filter(word => words2.includes(word)).length;
    const totalWords = Math.max(words1.length, words2.length);
    
    return totalWords > 0 ? commonWords / totalWords : 0;
  }
  
  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(word => word.length > 2);
  }
  
  private extractCommonConcepts(text1: string, text2: string): string[] {
    const words1 = new Set(this.tokenize(text1));
    const words2 = new Set(this.tokenize(text2));
    const common = [...words1].filter(word => words2.has(word));
    
    // Return top 3 most relevant concepts
    return common.slice(0, 3);
  }
}