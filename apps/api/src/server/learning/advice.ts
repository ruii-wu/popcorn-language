const PRACTICE_ADVICE: Record<string, string> = {
  'grammar.past_tense': 'Retell one finished event in three steps, checking each main verb: “I prepared, presented, and answered questions.”',
  'grammar.articles': 'Before sending, scan singular count nouns and choose a, an, or the: “I joined a team working on the launch.”',
  'grammar.modal_verbs': 'Practise one request at three politeness levels using can, could, and would: “Could you share the deadline?”',
  'grammar.conditionals': 'Link a condition to a realistic result: “If the schedule changes, I’ll update the team immediately.”',
  'grammar.tense_sequence': 'Keep the timeline consistent when reporting the past: “She said the client needed the revision that day.”',
  'grammar.prepositions': 'Collect useful phrases as chunks, then reuse them: “responsible for”, “interested in”, and “available on Monday”.',
  'grammar.subject_verb_agreement': 'Underline the subject before choosing the verb: “The results show…” but “The report shows…”.',
  'grammar.plurals': 'Check quantities and countable nouns before sending: “three projects”, “two interviews”, and “some advice”.',
  'grammar.relative_clauses': 'Combine two short ideas with who, which, or that: “I led a campaign that increased sign-ups.”',
  'grammar.gerunds_infinitives': 'Practise common verb patterns as full phrases: “enjoy working”, “plan to apply”, and “want to improve”.',
  'vocabulary.workplace': 'Use one precise workplace verb in your next reply, such as coordinate, prioritise, delegate, or follow up.',
  'vocabulary.interview': 'Answer with one role-specific action and result: “I coordinated the launch and increased sign-ups by 20%.”',
  'vocabulary.marketing': 'Describe one campaign using audience, channel, conversion, and outcome instead of general words like good or successful.',
  'vocabulary.social_casual': 'Add one natural conversational phrase to your next chat: “That sounds fun”, “How did it go?”, or “No way!”.',
  'vocabulary.food_daily': 'Describe one daily routine with specific nouns and verbs, then ask a related follow-up question.',
  'vocabulary.academic': 'Replace one vague verb with an academic one, such as analyse, demonstrate, evaluate, or indicate.',
  'pragmatics.polite_disagreement': 'Acknowledge first, then disagree with a reason: “I see your point, but I’m concerned about the deadline.”',
  'pragmatics.hedging': 'Soften one strong claim with may, might, perhaps, or it seems: “This might be difficult within the current timeline.”',
  'pragmatics.formal_register': 'Replace casual wording with one professional phrase: use “I would appreciate…” instead of “I want…”.',
  'pragmatics.small_talk': 'Use the three-step pattern notice, share, ask: “It’s busy today. My week has flown by. How about yours?”',
  'pragmatics.apology': 'Use apology, responsibility, and repair: “I’m sorry I missed that. I should have checked. I’ll send it today.”',
  'pragmatics.making_requests': 'Give context and make one specific polite request: “I’m reviewing the lease. Could you clarify whether bills are included?”',
  'pragmatics.giving_feedback': 'Name one strength, one impact, and one next step: “The structure is clear; adding evidence would make it stronger.”',
  'pragmatics.expressing_uncertainty': 'State what you know and what is uncertain: “I’m confident about the scope, but I may need to confirm the date.”',
  'interaction.self_introduction': 'Build a 30-second introduction with present role, relevant experience, and current goal.',
  'interaction.describing_experience': 'Use situation, action, and result in three sentences, ending with one measurable outcome.',
  'interaction.expressing_opinion': 'State your view, give one reason, and add an example: “I prefer option A because… For example…”.',
  'interaction.narration': 'Tell a short story in order using first, then, because, and finally.',
  'interaction.clarification': 'Ask one precise question before answering: “Could you clarify whether you mean the move-in date or the lease length?”',
  'interaction.turn_taking': 'Respond to the other speaker’s point, add one idea, then invite them back with a focused question.',
};

export function practiceAdviceFor(skillCode: string): string {
  return PRACTICE_ADVICE[skillCode]
    ?? 'Choose one focused example, practise it in your next conversation, and review the feedback afterwards.';
}
