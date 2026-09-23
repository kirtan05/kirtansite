/**
 * Writing tasks for /gree. The prompts are original, written in the style of
 * each task; ETS publishes the real GRE Issue pool too (linked in the app).
 */

export type Task = 'gre_issue' | 'toefl_email' | 'toefl_discussion' | 'free';

export interface TaskInfo {
  id: Task;
  name: string;
  minutes: number;
  target: [number, number]; // sensible word range
  brief: string;
  checks: string[];
  prompts: string[];
}

export const TASKS: TaskInfo[] = [
  {
    id: 'gre_issue',
    name: 'GRE Issue essay',
    minutes: 30,
    target: [450, 650],
    brief:
      'Take a clear position on the claim, then support it with specific reasons and examples. Address the part of the instructions after the claim. A good length is 450 to 650 words in 30 minutes.',
    checks: [
      'My position is stated plainly in the first paragraph',
      'Each body paragraph makes one reason and backs it with a concrete example',
      'I answered the specific instruction under the claim, not just the claim',
      'I dealt with at least one counterargument or limit of my view',
      'The conclusion restates the position without just copying the intro',
      'I reread for missing words, run-on sentences and repeated words',
    ],
    prompts: [
      'Governments should place few, if any, restrictions on scientific research and development.\n\nWrite a response in which you discuss the extent to which you agree or disagree with the claim. In developing your position, describe specific circumstances in which adopting the claim would or would not be advantageous.',
      'The best way to understand the character of a society is to study the people it chooses to celebrate.\n\nWrite a response in which you discuss the extent to which you agree or disagree with the statement and explain your reasoning. Consider ways in which the statement might or might not hold true.',
      'Universities should require every student to take courses outside their major field of study.\n\nWrite a response in which you discuss your views on the policy and explain your reasoning. Consider the possible consequences of implementing the policy.',
      'People who hold positions of power have a greater responsibility than others to act with integrity.\n\nWrite a response in which you discuss the extent to which you agree or disagree with the claim, using specific examples.',
      'Technology that makes daily life more convenient also makes people less capable of solving problems on their own.\n\nWrite a response in which you discuss the extent to which you agree or disagree with the statement. Address the most compelling reasons someone might give for disagreeing.',
      'A nation should be judged more by how it treats its weakest members than by its economic or military strength.\n\nWrite a response in which you discuss the extent to which you agree or disagree with the claim.',
      'The most important goal of education is to teach people how to question what they are told.\n\nWrite a response in which you discuss the extent to which you agree or disagree with the statement, and describe circumstances in which it might not hold.',
      'Leaders are most effective when they are willing to change their minds in response to criticism.\n\nWrite a response in which you discuss the extent to which you agree or disagree with the claim and the reasoning behind it.',
      'Scientific progress depends less on individual genius than on collaboration among many researchers.\n\nWrite a response in which you discuss the extent to which you agree or disagree with the statement, using specific examples.',
      'Local communities should have more control than national governments over decisions about their schools.\n\nWrite a response in which you discuss your views on the proposal and explain your reasoning. Consider the possible consequences.',
      'It is more valuable to specialize deeply in one field than to acquire broad knowledge of many.\n\nWrite a response in which you discuss the extent to which you agree or disagree, and address the strongest argument against your view.',
      'Any piece of art that requires lengthy explanation in order to be appreciated has failed as art.\n\nWrite a response in which you discuss the extent to which you agree or disagree with the claim.',
    ],
  },
  {
    id: 'toefl_discussion',
    name: 'TOEFL academic discussion',
    minutes: 10,
    target: [120, 180],
    brief:
      'A professor asks a question and two classmates reply. Write your own post that gives a clear opinion and adds a new point, not a repeat of theirs. Aim for at least 100 words; 120 to 180 is better.',
    checks: [
      'My opinion is clear in the first sentence',
      'I referred to at least one classmate by name',
      'I added a reason or example that neither classmate gave',
      'Sentences vary in length and I used a few linking words (however, for instance, as a result)',
    ],
    prompts: [
      'Professor: This week we are looking at urban planning. Some cities are banning private cars from their central districts. Is this a good idea?\n\nPriya: Yes. Cleaner air and safer streets matter more than convenience, and public transport can fill the gap.\n\nDaniel: I disagree. Small shops depend on customers who drive in, and a ban could empty the city centre.',
      'Professor: Many companies now let employees work from home permanently. Do the benefits for workers outweigh the costs for companies?\n\nMeera: For workers it is clearly better: no commute and more time with family.\n\nLucas: Companies lose something important, though. New employees learn much less when they never sit next to experienced colleagues.',
      'Professor: Should universities make internships a required part of every degree?\n\nArjun: Yes, because students learn how their field really works and build contacts before they graduate.\n\nSofia: Not every field needs it. A history or mathematics student may gain more from an extra semester of coursework.',
      'Professor: Governments spend large sums on space exploration. Should that money go to problems on Earth instead?\n\nKavya: Earth first. Hunger and climate change are urgent; Mars can wait.\n\nTom: Space research has produced many technologies we use daily, so it is not a choice between the two.',
      'Professor: Some schools have banned smartphones during the school day. Is this the right policy?\n\nRohan: Yes, phones are the biggest distraction students face.\n\nEmma: Banning them teaches nothing. Schools should teach students to use phones responsibly instead.',
      'Professor: When a new technology like AI changes an industry, who should pay to retrain the workers affected: governments, companies or the workers themselves?\n\nNisha: Companies profit from the change, so they should pay.\n\nOliver: Governments should, because only they can run training at the scale needed.',
    ],
  },
  {
    id: 'toefl_email',
    name: 'TOEFL email',
    minutes: 7,
    target: [100, 150],
    brief:
      'Write an email that does everything the situation asks, in a polite tone suited to the reader. Cover each bullet point. Aim for 100 to 150 words.',
    checks: [
      'Greeting and sign-off fit the reader (professor, manager, friend)',
      'I covered every bullet point in the task',
      'The purpose of the email is clear in the first two sentences',
      'Tone stays polite even when complaining or asking for something',
    ],
    prompts: [
      'You ordered a textbook online for a course that starts next week. The book arrived damaged and a chapter is missing. Write an email to the bookstore.\n\n• Explain what happened\n• Say why you need the book quickly\n• Ask for a specific solution',
      'Your manager has asked you to lead a new project, but you are already working on two deadlines. Write an email to your manager.\n\n• Thank them for the opportunity\n• Explain your current workload\n• Suggest a way to make it work',
      'A professor gave a guest lecture at your university that you found very useful. Write an email to the professor.\n\n• Say what you found most useful\n• Ask a follow-up question about the topic\n• Ask whether they could recommend further reading',
      'You are organising a study group for an exam, but one member keeps missing sessions. Write an email to that member.\n\n• Explain the problem politely\n• Describe how it affects the group\n• Propose a solution',
      'Your apartment building\'s management has announced renovation work that will be very noisy during the hours you work from home. Write an email to the building manager.\n\n• Describe how the noise affects you\n• Ask a question about the schedule\n• Suggest a change that would help',
      'A friend has asked you to recommend a city in your country to visit for a week. Write an email to your friend.\n\n• Recommend one city\n• Give two reasons for your choice\n• Suggest the best time of year to visit',
    ],
  },
  {
    id: 'free',
    name: 'Free writing',
    minutes: 15,
    target: [150, 400],
    brief: 'Anything at all: a journal entry, a paragraph using ten words you learned this week, or a summary of an article you read. Writing daily is what brings the skill back.',
    checks: ['I used at least five words from my word list', 'I reread it once before saving'],
    prompts: [
      'Write a paragraph using at least five words you learned this week. Underline them in your head as you go.',
      'Summarise an article you read today in your own words, in under 200 words.',
      'Describe a decision you made recently and argue that it was the right one.',
      'Explain something from your work to a smart person who knows nothing about it.',
    ],
  },
];

export const taskById = (id: string) => TASKS.find((t) => t.id === id) ?? TASKS[0];
