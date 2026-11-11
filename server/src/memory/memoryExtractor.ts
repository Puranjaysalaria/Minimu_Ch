import { MemoryRecord, MemoryRepository } from '../database/repositories/memoryRepo.js';
import { MessageRepository } from '../database/repositories/messageRepo.js';

export interface ExtractedFact {
  subject: string;
  predicate: string;
  value: string;
  category: 'preference' | 'budget' | 'plan' | 'decision' | 'fact' | 'correction';
  confidence: number;
  source_type: 'explicit_statement' | 'reasonable_inference' | 'uncertain';
  supersedes_predicate_match?: boolean;
}

export class MemoryExtractor {
  constructor(
    private memoryRepo: MemoryRepository,
    private messageRepo?: MessageRepository
  ) {}

  /**
   * Deterministic pattern extraction for high precision on common statements
   */
  extractFromText(text: string, conversationId?: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    const normalized = text.trim();

    // 1. Laptop brand preference
    const laptopBrandMatch = normalized.match(/(?:prefer|like|want)\s+(?:an?\s+)?([A-Za-z0-9\-]+)(?:\s+laptop|\s+brand)?/i);
    const laptopBrandMatch2 = normalized.match(/preferred\s+(?:laptop\s+)?brand\s+is\s+([A-Za-z0-9\-]+)/i);
    const brand = laptopBrandMatch2 ? laptopBrandMatch2[1] : (laptopBrandMatch ? laptopBrandMatch[1] : null);
    if (brand && /asus|dell|apple|lenovo|hp|acer|msi|samsung/i.test(brand)) {
      facts.push({
        subject: 'user',
        predicate: 'preferred_laptop_brand',
        value: brand.toUpperCase() === 'ASUS' ? 'ASUS' : brand,
        category: 'preference',
        confidence: 0.99,
        source_type: 'explicit_statement',
      });
    }

    // 2. Budget / Price for laptop or item
    const budgetMatch = normalized.match(/budget\s+(?:is|was|of)?\s*([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?)/i);
    if (budgetMatch) {
      const budgetVal = budgetMatch[1].trim();
      facts.push({
        subject: 'laptop',
        predicate: 'budget',
        value: budgetVal.startsWith('₹') ? budgetVal : (budgetVal.match(/^\d/) ? `₹${budgetVal}` : budgetVal),
        category: 'budget',
        confidence: 0.99,
        source_type: 'explicit_statement',
      });
    }

    // 3. Subscription price patterns (e.g. "subscription cost ₹499 per month" or "subscription now costs ₹599")
    const subNowMatch = normalized.match(/subscription\s+now\s+costs?\s*([₹$€£]?\s*[\d,]+(?:\s*(?:per|\/)\s*month)?)/i);
    if (subNowMatch) {
      facts.push({
        subject: 'subscription',
        predicate: 'price_per_month',
        value: subNowMatch[1].trim(),
        category: 'correction',
        confidence: 0.98,
        source_type: 'explicit_statement',
        supersedes_predicate_match: true,
      });
    } else {
      const subPriceMatch = normalized.match(/subscription\s+(?:costs?|was|priced\s+at)\s*([₹$€£]?\s*[\d,]+(?:\s*(?:per|\/)\s*month)?)/i);
      if (subPriceMatch) {
        facts.push({
          subject: 'subscription',
          predicate: 'price_per_month',
          value: subPriceMatch[1].trim(),
          category: 'fact',
          confidence: 0.98,
          source_type: 'explicit_statement',
        });
      }
    }

    // 4. General preference: "I prefer X", "My favorite X is Y"
    const generalPrefMatch = normalized.match(/my\s+favorite\s+([a-zA-Z\s]+)\s+is\s+([a-zA-Z0-9\s]+)/i);
    if (generalPrefMatch) {
      facts.push({
        subject: 'user',
        predicate: `favorite_${generalPrefMatch[1].trim().toLowerCase().replace(/\s+/g, '_')}`,
        value: generalPrefMatch[2].trim(),
        category: 'preference',
        confidence: 0.95,
        source_type: 'explicit_statement',
      });
    }

    // 5. Explicit decisions: "I decided to X", "We decided on X"
    const decisionMatch = normalized.match(/(?:i|we)\s+decided\s+(?:to|on)\s+([^\.]+)/i);
    if (decisionMatch) {
      facts.push({
        subject: 'user',
        predicate: 'decision',
        value: decisionMatch[1].trim(),
        category: 'decision',
        confidence: 0.92,
        source_type: 'explicit_statement',
      });
    }

    // 6. Plans: "I am planning to X"
    const planMatch = normalized.match(/(?:i\s+am|i'm)\s+planning\s+to\s+([^\.]+)/i);
    if (planMatch) {
      facts.push({
        subject: 'user',
        predicate: 'plan',
        value: planMatch[1].trim(),
        category: 'plan',
        confidence: 0.90,
        source_type: 'explicit_statement',
      });
    }

    // 6b. Laptop hardware specifications & requirements (GPU, Processor, RAM, Storage, etc.)
    // GPU: e.g. "RTX 50 60 or above", "RTX 4060", "GeForce RTX 5070", "dedicated GPU"
    const gpuMatch = normalized.match(/\b((?:geforce\s+)?(?:rtx|gtx)\s*[\d\s]+(?:\s*(?:ti|super))?(?:\s*or\s*(?:above|higher|better))?|radeon\s*rx\s*\d+)\b/i);
    if (gpuMatch) {
      // Normalize spacing like "50 60" to "5060"
      const cleanGpu = gpuMatch[1].trim().replace(/(\d)\s+(\d)/g, '$1$2');
      facts.push({
        subject: 'laptop',
        predicate: 'gpu_specs',
        value: cleanGpu,
        category: 'requirement',
        confidence: 0.98,
        source_type: 'explicit_statement',
      });
    }

    // Processor / CPU: e.g. "Intel Core i7", "Ryzen 7", "processor Intel i9", "M3 Pro"
    const cpuMatch = normalized.match(/(?:processor|cpu)\s*(?:is|should be|want|prefer|need)?\s*([a-zA-Z0-9\s\-]+)/i);
    const cpuDirectMatch = normalized.match(/\b(intel\s+(?:core\s+)?(?:i[3579]|ultra\s*[579])[\w\-]*|amd\s+ryzen\s*[3579][\w\-]*|ryzen\s*[3579][\w\-]*|apple\s+m[1234](?:\s*(?:pro|max))?)\b/i);
    const cpuVal = cpuDirectMatch ? cpuDirectMatch[1] : (cpuMatch ? cpuMatch[1] : null);
    if (cpuVal && /intel|amd|ryzen|core|i[3579]|m[1234]/i.test(cpuVal)) {
      facts.push({
        subject: 'laptop',
        predicate: 'processor',
        value: cpuVal.trim(),
        category: 'requirement',
        confidence: 0.96,
        source_type: 'explicit_statement',
      });
    }

    // RAM: e.g. "16GB RAM", "ram 32 gb"
    const ramMatch = normalized.match(/\b(\d+\s*gb)\s*(?:ram|memory)\b/i) || normalized.match(/\b(?:ram|memory)\s*(?:is|of)?\s*(\d+\s*gb)\b/i);
    if (ramMatch) {
      facts.push({
        subject: 'laptop',
        predicate: 'ram',
        value: `${ramMatch[1].trim()} RAM`,
        category: 'requirement',
        confidence: 0.95,
        source_type: 'explicit_statement',
      });
    }

    // Storage: e.g. "1TB SSD", "512GB storage"
    const storageMatch = normalized.match(/\b(\d+\s*(?:gb|tb))\s*(?:ssd|storage|nvme|drive)\b/i) || normalized.match(/\b(?:storage|ssd)\s*(?:is|of)?\s*(\d+\s*(?:gb|tb))\b/i);
    if (storageMatch) {
      facts.push({
        subject: 'laptop',
        predicate: 'storage',
        value: `${storageMatch[1].trim()} SSD`,
        category: 'requirement',
        confidence: 0.95,
        source_type: 'explicit_statement',
      });
    }

    // General specifications: "specific specs: RTX 5060", "specs are ..."
    const generalSpecMatch = normalized.match(/(?:specific\s+)?specs?\s*(?:are|is|want|need|of)?\s*:?\s*([^.\n]+)/i);
    if (generalSpecMatch && !gpuMatch && !cpuVal) {
      facts.push({
        subject: 'laptop',
        predicate: 'specs',
        value: generalSpecMatch[1].trim(),
        category: 'requirement',
        confidence: 0.92,
        source_type: 'explicit_statement',
      });
    }

    // 7. Bookmarks / Saved web sources in assistant confirmations or user notes
    const bmSourceMatch = normalized.match(/\*{0,2}Bookmarked Source:?\*{0,2}\s*(?:\[([^\]]+)\]\(([^)]+)\)|([^\n\r*]+))/i);
    if (bmSourceMatch) {
      const title = bmSourceMatch[1] || bmSourceMatch[3];
      const url = bmSourceMatch[2];
      const val = url ? `${title.trim()} (${url.trim()})` : title.trim();
      facts.push({
        subject: 'user',
        predicate: 'bookmarked_source',
        value: val,
        category: 'fact',
        confidence: 0.99,
        source_type: 'explicit_statement',
      });
    }

    // Direct user bookmark statements: "bookmark this link: ...", "save this source: ..."
    const directBmMatch = normalized.match(/(?:bookmark|save|note)\s+(?:this\s+)?(?:source|link|url|website|article):\s*([^\n\r]+)/i);
    if (directBmMatch) {
      facts.push({
        subject: 'user',
        predicate: 'bookmarked_source',
        value: directBmMatch[1].trim(),
        category: 'fact',
        confidence: 0.99,
        source_type: 'explicit_statement',
      });
    }

    // User directive referencing earlier source: "note the first source you gave me and mark it as Bookmark"
    if (
      /(?:note|bookmark|mark|save)\s+(?:the\s+)?(?:first|1st|\d+)?\s*(?:one\s+)?source.*(?:bookmark|save|note)/i.test(normalized) ||
      /mark\s+(?:it\s+)?as\s+bookmark/i.test(normalized)
    ) {
      if (this.messageRepo && conversationId) {
        const msgs = this.messageRepo.getByConversationId(conversationId);
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (m.role === 'assistant') {
            const metaCitations = (m.metadata as any)?.citations as Array<{ title: string; url: string }> | undefined;
            if (metaCitations && metaCitations.length > 0) {
              facts.push({
                subject: 'user',
                predicate: 'bookmarked_source',
                value: `${metaCitations[0].title} (${metaCitations[0].url})`,
                category: 'fact',
                confidence: 0.99,
                source_type: 'explicit_statement',
              });
              break;
            }
            const mdLinkMatch = m.content.match(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/);
            if (mdLinkMatch) {
              facts.push({
                subject: 'user',
                predicate: 'bookmarked_source',
                value: `${mdLinkMatch[1]} (${mdLinkMatch[2]})`,
                category: 'fact',
                confidence: 0.99,
                source_type: 'explicit_statement',
              });
              break;
            }
          }
        }
      }
    }

    // 8. Location & City
    const locationMatch = normalized.match(/(?:i\s+live\s+in|i'm\s+based\s+in|i\s+moved\s+to|located\s+in)\s+([a-zA-Z\s]+)/i);
    if (locationMatch && !/buying|laptop|finding/i.test(locationMatch[1])) {
      facts.push({
        subject: 'user',
        predicate: 'location',
        value: locationMatch[1].trim(),
        category: 'fact',
        confidence: 0.95,
        source_type: 'explicit_statement',
      });
    }

    // 9. Profession / Role / Company
    const workMatch = normalized.match(/(?:i\s+work\s+as\s+(?:an?|the)?|i\s+am\s+(?:an?|the)?)\s+([a-zA-Z\s]+?)(?:\s+at\s+([a-zA-Z0-9\s]+))?(?:\.|$)/i);
    if (workMatch && !/planning|hoping|looking|wanting|trying/i.test(workMatch[1])) {
      const role = workMatch[1].trim();
      if (/engineer|developer|designer|manager|student|architect|scientist|doctor|consultant|founder|analyst|writer|photographer/i.test(role)) {
        facts.push({
          subject: 'user',
          predicate: 'profession',
          value: role,
          category: 'fact',
          confidence: 0.95,
          source_type: 'explicit_statement',
        });
        if (workMatch[2]) {
          facts.push({
            subject: 'user',
            predicate: 'company',
            value: workMatch[2].trim(),
            category: 'fact',
            confidence: 0.95,
            source_type: 'explicit_statement',
          });
        }
      }
    }
    const companyMatch = normalized.match(/(?:i\s+work\s+at|my\s+company\s+is)\s+([a-zA-Z0-9\s]+)/i);
    if (companyMatch) {
      facts.push({
        subject: 'user',
        predicate: 'company',
        value: companyMatch[1].trim(),
        category: 'fact',
        confidence: 0.95,
        source_type: 'explicit_statement',
      });
    }

    // 10. Explicit "Remember that X", "Keep in mind that X", "Note that X"
    const rememberMatch = normalized.match(/(?:remember\s+(?:that)?|keep\s+in\s+mind\s+(?:that)?|note\s+that)\s+([^.]+)/i);
    if (rememberMatch) {
      facts.push({
        subject: 'user',
        predicate: 'noted_fact',
        value: rememberMatch[1].trim(),
        category: 'fact',
        confidence: 0.95,
        source_type: 'explicit_statement',
      });
    }

    // 11. Important Dates (birthday, anniversary, deadline, exam)
    const dateMatch = normalized.match(/(?:my\s+(?:birthday|anniversary|exam|deadline|flight))\s+is\s+(?:on\s+)?([a-zA-Z0-9\s,]+)/i);
    if (dateMatch) {
      const eventType = normalized.match(/(birthday|anniversary|exam|deadline|flight)/i)![1].toLowerCase();
      facts.push({
        subject: 'user',
        predicate: `${eventType}_date`,
        value: dateMatch[1].trim(),
        category: 'fact',
        confidence: 0.95,
        source_type: 'explicit_statement',
      });
    }

    // 12. Tech stack & Programming languages
    const techMatch = normalized.match(/(?:i\s+use|we\s+use|my\s+primary\s+language\s+is|i\s+code\s+in)\s+([a-zA-Z0-9\s,]+)/i);
    if (techMatch && /python|javascript|typescript|react|node|rust|go|java|c\+\+|sql|aws|docker|kubernetes/i.test(techMatch[1])) {
      facts.push({
        subject: 'user',
        predicate: 'tech_stack',
        value: techMatch[1].trim(),
        category: 'preference',
        confidence: 0.94,
        source_type: 'explicit_statement',
      });
    }

    // 13. Travel & Vacation Plans
    const travelMatch = normalized.match(/(?:traveling\s+to|trip\s+to|visit(?:ing)?|vacation\s+in)\s+([a-zA-Z\s]+?)(?:\s+in\s+([a-zA-Z]+))?(?:\.|$)/i);
    if (travelMatch) {
      const dest = travelMatch[1].trim();
      const time = travelMatch[2] ? ` in ${travelMatch[2].trim()}` : '';
      facts.push({
        subject: 'user',
        predicate: 'travel_plan',
        value: `Trip to ${dest}${time}`,
        category: 'plan',
        confidence: 0.92,
        source_type: 'explicit_statement',
      });
    }

    // 14. Pets
    const petMatch = normalized.match(/(?:my\s+(?:dog|cat|pet)|i\s+have\s+a\s+(?:dog|cat|pet))\s+(?:named|is)?\s*([a-zA-Z0-9\s]+)/i);
    if (petMatch) {
      facts.push({
        subject: 'user',
        predicate: 'pet',
        value: petMatch[0].trim(),
        category: 'fact',
        confidence: 0.95,
        source_type: 'explicit_statement',
      });
    }

    return facts;
  }

  /**
   * Process and persist extracted facts from a turn.
   * Handles supersedes linkage so historical truth remains immutable.
   */
  processAndSave(
    text: string,
    conversationId: string,
    messageId: string,
    turnTimestamp?: string
  ): MemoryRecord[] {
    const facts = this.extractFromText(text, conversationId);
    const recordedAt = turnTimestamp || new Date().toISOString();
    const savedRecords: MemoryRecord[] = [];

    for (const fact of facts) {
      // Check if an existing active record for the same subject and predicate exists
      const existing = this.memoryRepo.getBySubjectAndPredicate(fact.subject, fact.predicate, true);

      let supersedesId: string | null = null;
      if (existing.length > 0) {
        // The most recent active record is superseded
        supersedesId = existing[0].id;
      }

      const record = this.memoryRepo.create({
        subject: fact.subject,
        predicate: fact.predicate,
        value: fact.value,
        category: fact.category,
        confidence: fact.confidence,
        source_type: fact.source_type,
        source_message_id: messageId,
        source_conversation_id: conversationId,
        valid_from: recordedAt,
        recorded_at: recordedAt,
        supersedes_id: supersedesId,
      });

      savedRecords.push(record);
    }

    return savedRecords;
  }
}
