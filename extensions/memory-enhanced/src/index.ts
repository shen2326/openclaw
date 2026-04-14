import { type OpenClawPlugin } from "openclaw/plugin-sdk";
import { SemanticLinkingManager } from "./semantic-linking/manager.js";
import { KnowledgeGraphManager } from "./knowledge-graph/manager.js";
import { MemoryCompressionManager } from "./compression/manager.js";
import { DreamingScheduler } from "./dreaming/scheduler.js";

export const plugin: OpenClawPlugin = {
  id: "memory-enhanced",
  kind: "memory",
  async initialize(context) {
    const config = context.config.get("plugins.entries.memory-enhanced.config") ?? {};
    
    // Initialize semantic linking
    if (config.semanticLinking?.enabled !== false) {
      const semanticLinking = new SemanticLinkingManager(context, config.semanticLinking);
      await semanticLinking.initialize();
    }
    
    // Initialize knowledge graph
    if (config.knowledgeGraph?.enabled !== false) {
      const knowledgeGraph = new KnowledgeGraphManager(context, config.knowledgeGraph);
      await knowledgeGraph.initialize();
    }
    
    // Initialize memory compression
    const compression = new MemoryCompressionManager(context, config.compression);
    await compression.initialize();
    
    // Initialize dreaming scheduler
    if (config.dreaming?.enabled !== false) {
      const dreaming = new DreamingScheduler(context, config.dreaming);
      await dreaming.initialize();
    }
    
    context.logger.info("Memory Enhanced plugin initialized successfully");
  },
};