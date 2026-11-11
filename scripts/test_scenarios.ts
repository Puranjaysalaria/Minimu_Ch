import { getDatabase } from '../server/src/database/connection.js';
import { ConversationService } from '../server/src/conversations/conversationService.js';
import { MemoryRetriever } from '../server/src/memory/memoryRetriever.js';
import { CitationService } from '../server/src/citations/citationService.js';
import { MemoryRepository } from '../server/src/database/repositories/memoryRepo.js';
import { MessageRepository } from '../server/src/database/repositories/messageRepo.js';
import { EntityRepository } from '../server/src/database/repositories/entityRepo.js';
import { defaultTemporalResolver } from '../server/src/memory/temporalResolver.js';
import { AgentOrchestrator } from '../server/src/agent/orchestrator.js';

async function main() {
  const db = getDatabase();
  const convService = new ConversationService(db);
  const memoryRepo = new MemoryRepository(db);
  const messageRepo = new MessageRepository(db);
  const entityRepo = new EntityRepository(db);
  const citationService = new CitationService(db);

  const retriever = new MemoryRetriever(
    memoryRepo,
    messageRepo,
    entityRepo,
    defaultTemporalResolver
  );

  const orchestrator = new AgentOrchestrator(
    convService,
    retriever,
    citationService
  );

  const conv = convService.createConversation('Scenario Verification');

  const testQueries = [
    'where i live',
    'which company i work for',
    'where do i work',
    'what processor',
    'about the specs',
    'give me the data in tabular format',
  ];

  for (const q of testQueries) {
    console.log(`\n========================================`);
    console.log(`User Query: "${q}"`);
    console.log(`========================================`);
    try {
      const res = await orchestrator.run({
        conversationId: conv.id,
        userMessage: q,
      });
      console.log(`Agent Reply:\n${res.reply}`);
    } catch (err: any) {
      console.error(`Error:`, err.message);
    }
  }
}

main();
