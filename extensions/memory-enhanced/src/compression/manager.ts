import { type PluginContext } from "openclaw/plugin-sdk";
import { CompressionConfig } from "./types.js";
import { MemoryEntry } from "../types.js";
import fs from "node:fs/promises";
import path from "node:path";

export class MemoryCompressionManager {
  private context: PluginContext;
  private config: CompressionConfig;
  
  constructor(context: PluginContext, config?: CompressionConfig) {
    this.context = context;
    this.config = config ?? {};
  }
  
  async initialize(): Promise<void> {
    this.context.logger.info("Initializing Memory Compression Manager");
    
    // Register compression schedules
    if (this.config.weekly?.enabled !== false && this.config.weekly?.schedule) {
      this.context.cron.add({
        name: "memory-compression-weekly",
        schedule: { kind: "cron", expr: this.config.weekly.schedule },
        payload: { kind: "agentTurn", message: "/memory compress weekly" },
        sessionTarget: "current"
      });
    }
    
    if (this.config.monthly?.enabled !== false && this.config.monthly?.schedule) {
      this.context.cron.add({
        name: "memory-compression-monthly", 
        schedule: { kind: "cron", expr: this.config.monthly.schedule },
        payload: { kind: "agentTurn", message: "/memory compress monthly" },
        sessionTarget: "current"
      });
    }
    
    // Register command handlers
    this.context.commands.register({
      name: "memory-compress",
      handler: async (args) => {
        const level = args[0] || "daily";
        await this.compressMemory(level);
      }
    });
  }
  
  async compressMemory(level: string): Promise<void> {
    this.context.logger.info(`Starting ${level} memory compression`);
    
    try {
      switch (level) {
        case "daily":
          await this.compressDaily();
          break;
        case "weekly":
          await this.compressWeekly();
          break;
        case "monthly":
          await this.compressMonthly();
          break;
        default:
          throw new Error(`Unknown compression level: ${level}`);
      }
      
      this.context.logger.info(`${level} memory compression completed successfully`);
    } catch (error) {
      this.context.logger.error(`Memory compression failed: ${error}`);
      throw error;
    }
  }
  
  private async compressDaily(): Promise<void> {
    if (this.config.daily?.enabled === false) return;
    
    // Daily compression: organize today's memory entries
    const today = new Date().toISOString().split('T')[0];
    const dailyEntries = await this.getMemoryEntriesForDate(today);
    
    if (dailyEntries.length === 0) return;
    
    // Create or update daily summary
    const summary = this.generateDailySummary(dailyEntries);
    const summaryPath = path.join(this.context.workspaceDir, "memory", `${today}.md`);
    
    // Append to existing file or create new one
    let existingContent = "";
    try {
      existingContent = await fs.readFile(summaryPath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    
    const updatedContent = this.mergeDailyContent(existingContent, summary);
    await fs.writeFile(summaryPath, updatedContent);
  }
  
  private async compressWeekly(): Promise<void> {
    if (this.config.weekly?.enabled === false) return;
    
    // Weekly compression: aggregate last 7 days
    const weeklyEntries = await this.getMemoryEntriesForPeriod(7);
    if (weeklyEntries.length === 0) return;
    
    const summary = this.generateWeeklySummary(weeklyEntries);
    const weekNumber = this.getWeekNumber(new Date());
    const summaryPath = path.join(this.context.workspaceDir, "memory", `week-${weekNumber}.md`);
    
    await fs.writeFile(summaryPath, summary);
    
    // Also update MEMORY.md with key insights
    await this.updateLongTermMemory(summary);
  }
  
  private async compressMonthly(): Promise<void> {
    if (this.config.monthly?.enabled === false) return;
    
    // Monthly compression: aggregate last 30 days
    const monthlyEntries = await this.getMemoryEntriesForPeriod(30);
    if (monthlyEntries.length === 0) return;
    
    const summary = this.generateMonthlySummary(monthlyEntries);
    const month = new Date().toISOString().substring(0, 7);
    const summaryPath = path.join(this.context.workspaceDir, "memory", `month-${month}.md`);
    
    await fs.writeFile(summaryPath, summary);
    
    // Update MEMORY.md with curated long-term knowledge
    await this.updateLongTermMemory(summary, true);
  }
  
  private async getMemoryEntriesForDate(date: string): Promise<MemoryEntry[]> {
    const memoryDir = path.join(this.context.workspaceDir, "memory");
    const files = await fs.readdir(memoryDir);
    const entries: MemoryEntry[] = [];
    
    for (const file of files) {
      if (file.startsWith(date) && file.endsWith(".md")) {
        const content = await fs.readFile(path.join(memoryDir, file), "utf-8");
        entries.push({ file, content, timestamp: date });
      }
    }
    
    return entries;
  }
  
  private async getMemoryEntriesForPeriod(days: number): Promise<MemoryEntry[]> {
    const memoryDir = path.join(this.context.workspaceDir, "memory");
    const files = await fs.readdir(memoryDir);
    const entries: MemoryEntry[] = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    for (const file of files) {
      if (file.match(/^\d{4}-\d{2}-\d{2}\.md$/) && file !== "MEMORY.md") {
        const fileDate = new Date(file.replace(".md", ""));
        if (fileDate >= cutoffDate) {
          const content = await fs.readFile(path.join(memoryDir, file), "utf-8");
          entries.push({ file, content, timestamp: file.replace(".md", "") });
        }
      }
    }
    
    return entries;
  }
  
  private generateDailySummary(entries: MemoryEntry[]): string {
    let summary = `# Daily Memory Summary - ${entries[0]?.timestamp || new Date().toISOString().split('T')[0]}\n\n`;
    
    for (const entry of entries) {
      // Extract key points from each entry
      const keyPoints = this.extractKeyPoints(entry.content);
      if (keyPoints.length > 0) {
        summary += `## ${entry.file.replace(".md", "")}\n`;
        summary += keyPoints.map(point => `- ${point}`).join("\n") + "\n\n";
      }
    }
    
    return summary;
  }
  
  private generateWeeklySummary(entries: MemoryEntry[]): string {
    const themes = this.identifyThemes(entries);
    let summary = `# Weekly Memory Summary - Week ${this.getWeekNumber(new Date())}\n\n`;
    
    summary += `**Key Themes:** ${themes.join(", ")}\n\n`;
    
    // Group entries by theme
    const groupedEntries = this.groupEntriesByTheme(entries, themes);
    for (const [theme, themeEntries] of Object.entries(groupedEntries)) {
      summary += `## ${theme}\n`;
      for (const entry of themeEntries) {
        const keyPoints = this.extractKeyPoints(entry.content);
        if (keyPoints.length > 0) {
          summary += `- **${entry.file.replace(".md", "")}:** ${keyPoints[0]}\n`;
        }
      }
      summary += "\n";
    }
    
    return summary;
  }
  
  private generateMonthlySummary(entries: MemoryEntry[]): string {
    const themes = this.identifyThemes(entries);
    let summary = `# Monthly Memory Summary - ${new Date().toISOString().substring(0, 7)}\n\n`;
    
    summary += `**Core Competencies Developed:**\n`;
    for (const theme of themes) {
      summary += `- ${theme}\n`;
    }
    summary += "\n";
    
    // Extract learning progression
    const progression = this.extractLearningProgression(entries);
    if (progression.length > 0) {
      summary += `**Learning Progression:**\n`;
      summary += progression.map((step, index) => `${index + 1}. ${step}`).join("\n") + "\n\n";
    }
    
    return summary;
  }
  
  private async updateLongTermMemory(summary: string, isMonthly: boolean = false): Promise<void> {
    const memoryPath = path.join(this.context.workspaceDir, "MEMORY.md");
    let existingContent = "";
    
    try {
      existingContent = await fs.readFile(memoryPath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      // Create new MEMORY.md if it doesn't exist
      existingContent = "# MEMORY.md - Long-Term Memory\n\n*Curated memories worth keeping across sessions.*\n\n---\n";
    }
    
    // Insert new summary at appropriate location
    let updatedContent = existingContent;
    if (isMonthly) {
      // For monthly summaries, add to the top after the header
      const headerEnd = existingContent.indexOf("---\n") + 4;
      updatedContent = existingContent.substring(0, headerEnd) + "\n" + summary + "\n" + existingContent.substring(headerEnd);
    } else {
      // For weekly summaries, append to the end
      updatedContent = existingContent + "\n" + summary;
    }
    
    await fs.writeFile(memoryPath, updatedContent);
  }
  
  private extractKeyPoints(content: string): string[] {
    // Extract bullet points and key sentences
    const lines = content.split("\n");
    const keyPoints: string[] = [];
    
    for (const line of lines) {
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        keyPoints.push(line.trim().substring(2));
      } else if (line.includes("**") && line.length < 100) {
        // Short lines with bold text are likely key points
        keyPoints.push(line.trim());
      }
    }
    
    return keyPoints.slice(0, 3); // Limit to top 3 key points
  }
  
  private identifyThemes(entries: MemoryEntry[]): string[] {
    // Simple theme identification based on common words
    const allText = entries.map(e => e.content).join(" ");
    const words = allText.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(word => word.length > 4);
    
    // Count word frequencies
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
    
    // Return top 5 most frequent words as themes
    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
  }
  
  private groupEntriesByTheme(entries: MemoryEntry[], themes: string[]): Record<string, MemoryEntry[]> {
    const grouped: Record<string, MemoryEntry[]> = {};
    for (const theme of themes) {
      grouped[theme] = [];
    }
    
    for (const entry of entries) {
      let bestTheme = themes[0];
      let bestScore = 0;
      
      for (const theme of themes) {
        const score = this.calculateThemeRelevance(entry.content, theme);
        if (score > bestScore) {
          bestScore = score;
          bestTheme = theme;
        }
      }
      
      grouped[bestTheme].push(entry);
    }
    
    return grouped;
  }
  
  private calculateThemeRelevance(content: string, theme: string): number {
    const themeLower = theme.toLowerCase();
    const contentLower = content.toLowerCase();
    return contentLower.split(themeLower).length - 1;
  }
  
  private extractLearningProgression(entries: MemoryEntry[]): string[] {
    // Sort entries by date and extract progression
    const sortedEntries = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const progression: string[] = [];
    
    for (const entry of sortedEntries) {
      const keyPoints = this.extractKeyPoints(entry.content);
      if (keyPoints.length > 0) {
        progression.push(keyPoints[0]);
      }
    }
    
    return progression.slice(0, 5); // Limit to 5 steps
  }
  
  private mergeDailyContent(existing: string, newSummary: string): string {
    // If existing content already contains the summary sections, merge them
    if (existing.includes("# Daily Memory Summary")) {
      // Replace the existing summary with the new one
      const lines = existing.split("\n");
      const summaryStart = lines.findIndex(line => line.startsWith("# Daily Memory Summary"));
      if (summaryStart !== -1) {
        const summaryEnd = lines.findIndex((line, index) => index > summaryStart && line.startsWith("# "));
        if (summaryEnd === -1) {
          // Summary goes to the end
          return lines.slice(0, summaryStart).join("\n") + "\n" + newSummary;
        } else {
          // Replace between summaryStart and summaryEnd
          return lines.slice(0, summaryStart).join("\n") + "\n" + newSummary + "\n" + lines.slice(summaryEnd).join("\n");
        }
      }
    }
    
    // If no existing summary, just append
    return existing + "\n" + newSummary;
  }
  
  private getWeekNumber(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + start.getDay() + 1) / 7);
  }
}