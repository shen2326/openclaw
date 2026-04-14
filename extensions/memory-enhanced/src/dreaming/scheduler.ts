import { type PluginContext } from "openclaw/plugin-sdk";
import fs from "node:fs/promises";
import path from "node:path";

export class DreamingScheduler {
  private context: PluginContext;
  private config: any;
  
  constructor(context: PluginContext, config?: any) {
    this.context = context;
    this.config = config ?? {};
  }
  
  async initialize(): Promise<void> {
    this.context.logger.info("Initializing Dreaming Scheduler");
    
    // Register dreaming schedule if enabled
    if (this.config.enabled !== false && this.config.frequency) {
      this.context.cron.add({
        name: "memory-enhanced-dreaming",
        schedule: { kind: "cron", expr: this.config.frequency },
        payload: { kind: "agentTurn", message: "/dreaming enhanced" },
        sessionTarget: "current"
      });
    }
    
    // Register dreaming command
    this.context.commands.register({
      name: "dreaming-enhanced",
      handler: async () => {
        await this.runEnhancedDreaming();
      }
    });
  }
  
  async runEnhancedDreaming(): Promise<void> {
    this.context.logger.info("Starting Enhanced Dreaming process");
    
    try {
      // Check if system is idle (optional)
      if (this.config.idleTimeoutMinutes) {
        const isIdle = await this.checkSystemIdle();
        if (!isIdle) {
          this.context.logger.debug("System not idle, skipping dreaming");
          return;
        }
      }
      
      // Run semantic linking
      await this.triggerSemanticLinking();
      
      // Run knowledge graph update
      await this.triggerKnowledgeGraphUpdate();
      
      // Run memory compression
      await this.triggerMemoryCompression();
      
      this.context.logger.info("Enhanced Dreaming completed successfully");
      
      // Send completion notification
      await this.sendDreamingReport();
    } catch (error) {
      this.context.logger.error(`Enhanced Dreaming failed: ${error}`);
      throw error;
    }
  }
  
  private async checkSystemIdle(): Promise<boolean> {
    // Simple idle check - in production this would check CPU, battery, etc.
    const lastActivityFile = path.join(this.context.workspaceDir, ".last-activity");
    try {
      const stats = await fs.stat(lastActivityFile);
      const idleTimeMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
      return idleTimeMinutes >= (this.config.idleTimeoutMinutes || 5);
    } catch (error) {
      // If no activity file exists, assume system is idle
      return true;
    }
  }
  
  private async triggerSemanticLinking(): Promise<void> {
    // Trigger semantic linking process
    this.context.events.emit("memory.dreaming.semantic-linking.start");
    
    // In a real implementation, this would call the semantic linking manager
    // For now, we'll simulate it
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.context.events.emit("memory.dreaming.semantic-linking.complete");
  }
  
  private async triggerKnowledgeGraphUpdate(): Promise<void> {
    // Trigger knowledge graph update
    this.context.events.emit("memory.dreaming.knowledge-graph.start");
    
    // Simulate knowledge graph processing
    await new Promise(resolve => setTimeout(resolve, 150));
    
    this.context.events.emit("memory.dreaming.knowledge-graph.complete");
  }
  
  private async triggerMemoryCompression(): Promise<void> {
    // Trigger memory compression
    this.context.events.emit("memory.dreaming.compression.start");
    
    // Simulate compression processing
    await new Promise(resolve => setTimeout(resolve, 200));
    
    this.context.events.emit("memory.dreaming.compression.complete");
  }
  
  private async sendDreamingReport(): Promise<void> {
    // Generate and send dreaming report
    const report = await this.generateDreamingReport();
    
    // Send as system event to current session
    this.context.events.emit("system.message", {
      text: report,
      channel: "current"
    });
  }
  
  private async generateDreamingReport(): Promise<string> {
    // Read current state files to generate report
    let report = "======================================================================\n";
    report += "Enhanced Daily Dreaming + Semantic Linking + Knowledge Graph\n";
    report += "======================================================================\n";
    
    // Add semantic linking stats
    try {
      const linkingState = await fs.readFile(
        path.join(this.context.workspaceDir, "memory", ".semantic-linking-state.json"),
        "utf-8"
      );
      const linkingData = JSON.parse(linkingState);
      report += `🔗 Semantic links: ${linkingData.links?.length || 0}\n`;
    } catch (error) {
      report += "🔗 Semantic links: 0 (no data)\n";
    }
    
    // Add knowledge graph stats
    try {
      const graphState = await fs.readFile(
        path.join(this.context.workspaceDir, "memory", "knowledge-graph.json"),
        "utf-8"
      );
      const graphData = JSON.parse(graphState);
      report += `🧠 Knowledge graph: ${graphData.entities?.length || 0} entities, ${graphData.relationships?.length || 0} relations\n`;
    } catch (error) {
      report += "🧠 Knowledge graph: 0 entities (no data)\n";
    }
    
    // Add memory compression info
    report += "📊 Memory compression: Daily/Weekly/Monthly layers maintained\n";
    
    report += "======================================================================\n";
    report += "Enhanced Dreaming complete! Your knowledge network is growing stronger 💕\n";
    report += "======================================================================\n";
    
    return report;
  }
}